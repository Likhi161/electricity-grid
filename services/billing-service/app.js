const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const fs = require('fs');
const path = require('path');
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./swagger');
const { sequelize, Consumer, User, Meter, MeterReading, Tariff, Recharge, Bill, Notification } = require('../../shared/database/models');
const { authenticate, authorize } = require('./middleware/auth');
const { Op } = require('sequelize');

const app = express();

app.use(express.json());
app.use(cors());
app.use(helmet());
app.use(morgan('dev'));

// S3 helper for invoice management (with local fallback)
const { uploadBill, downloadBill } = require('../../shared/database/s3-helper');
const { invokeLambda } = require('../../shared/database/aws-helpers');

// Custom Rate Limiter
const rateLimitMap = new Map();
app.use((req, res, next) => {
  const ip = req.ip;
  const now = Date.now();
  if (!rateLimitMap.has(ip)) rateLimitMap.set(ip, []);
  const requests = rateLimitMap.get(ip).filter(t => now - t < 15 * 60 * 1000);
  requests.push(now);
  rateLimitMap.set(ip, requests);
  if (requests.length > 200) return res.status(429).json({ error: 'Too many requests' });
  next();
});

// Swagger Docs
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Health Check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy', service: 'billing-service', timestamp: new Date() });
});

// GET all tariffs
app.get('/api/tariffs', authenticate, async (req, res) => {
  try {
    const tariffs = await Tariff.findAll({ order: [['effective_date', 'DESC'], ['id', 'DESC']] });
    return res.status(200).json(tariffs);
  } catch (error) {
    console.error('Fetch Tariffs Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST create tariff (Admin only)
app.post('/api/tariffs', authenticate, authorize(['ADMIN']), async (req, res) => {
  const { tariff_name, rate_per_unit, effective_date } = req.body;

  if (!tariff_name || !rate_per_unit || !effective_date) {
    return res.status(400).json({ error: 'Tariff name, rate, and effective date are required' });
  }

  try {
    const tariff = await Tariff.create({
      tariff_name,
      rate_per_unit,
      effective_date
    });
    return res.status(201).json({ message: 'Tariff created successfully', tariff });
  } catch (error) {
    console.error('Create Tariff Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET all recharges (Staff/Supervisor/Admin only)
app.get('/api/recharges', authenticate, authorize(['STAFF', 'SUPERVISOR', 'ADMIN']), async (req, res) => {
  try {
    const recharges = await Recharge.findAll({
      include: [{ model: Consumer, as: 'consumer', include: [{ model: User, as: 'user', attributes: ['name', 'email'] }] }],
      order: [['created_at', 'DESC']]
    });
    return res.status(200).json(recharges);
  } catch (error) {
    console.error('Fetch Recharges Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET recharges for specific consumer (Staff/Supervisor/Admin or self)
app.get('/api/recharges/consumer/:consumerId', authenticate, async (req, res) => {
  const { consumerId } = req.params;
  try {
    const consumer = await Consumer.findByPk(consumerId);
    if (!consumer) return res.status(404).json({ error: 'Consumer not found' });

    if (req.user.role === 'CONSUMER' && consumer.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized to access these records' });
    }

    const recharges = await Recharge.findAll({
      where: { consumer_id: consumerId },
      order: [['created_at', 'DESC']]
    });
    return res.status(200).json(recharges);
  } catch (error) {
    console.error('Fetch Consumer Recharges Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST process recharge (Consumer themselves or Staff/Admin)
app.post('/api/recharges', authenticate, async (req, res) => {
  const { consumer_id, amount } = req.body;

  if (amount === undefined || parseFloat(amount) <= 0) {
    return res.status(400).json({ error: 'Recharge amount must be a positive number' });
  }

  const transaction = await sequelize.transaction();
  try {
    const consumer = await Consumer.findByPk(consumer_id, { transaction });
    if (!consumer) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Consumer not found' });
    }

    // Auth verification: Consumers can only recharge their own account
    if (req.user.role === 'CONSUMER' && consumer.user_id !== req.user.id) {
      await transaction.rollback();
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const currentBalance = parseFloat(consumer.balance);
    const newBalance = currentBalance + parseFloat(amount);
    
    // Save previous status to check if service reconnected
    const oldStatus = consumer.connection_status;

    consumer.balance = newBalance;
    
    // Automatic reconnection if balance restored above ₹0
    if (newBalance > 0 && oldStatus === 'DISCONNECTED') {
      consumer.connection_status = 'CONNECTED';
    }

    await consumer.save({ transaction });

    // Store Recharge history record
    const recharge = await Recharge.create({
      consumer_id,
      amount,
      balance_added: amount
    }, { transaction });

    // Create Notification alert
    await Notification.create({
      user_id: consumer.user_id,
      title: 'Recharge Successful',
      message: `Your account has been recharged with ₹${parseFloat(amount).toFixed(2)}. Current Balance: ₹${newBalance.toFixed(2)}. Status: ${consumer.connection_status}.`,
      type: 'RECHARGE'
    }, { transaction });

    await transaction.commit();
    return res.status(201).json({
      message: `Recharge of ₹${parseFloat(amount).toFixed(2)} completed successfully.`,
      recharge,
      newBalance,
      connectionStatus: consumer.connection_status
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Recharge Processing Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET all bills (Staff/Supervisor/Admin only)
app.get('/api/bills', authenticate, authorize(['STAFF', 'SUPERVISOR', 'ADMIN']), async (req, res) => {
  try {
    const bills = await Bill.findAll({
      include: [{ model: Consumer, as: 'consumer', include: [{ model: User, as: 'user', attributes: ['name', 'email'] }] }],
      order: [['created_at', 'DESC']]
    });
    return res.status(200).json(bills);
  } catch (error) {
    console.error('Fetch Bills Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET billing history for specific consumer
app.get('/api/bills/consumer/:consumerId', authenticate, async (req, res) => {
  const { consumerId } = req.params;
  try {
    const consumer = await Consumer.findByPk(consumerId);
    if (!consumer) return res.status(404).json({ error: 'Consumer not found' });

    if (req.user.role === 'CONSUMER' && consumer.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const bills = await Bill.findAll({
      where: { consumer_id: consumerId },
      order: [['created_at', 'DESC']]
    });
    return res.status(200).json(bills);
  } catch (error) {
    console.error('Fetch Consumer Bills Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST generate monthly bill for consumer (Staff/Admin only)
app.post('/api/bills/generate', authenticate, authorize(['STAFF', 'ADMIN']), async (req, res) => {
  const { consumerId, billingMonth } = req.body; // billingMonth in YYYY-MM format

  if (!consumerId || !billingMonth || !/^\d{4}-\d{2}$/.test(billingMonth)) {
    return res.status(400).json({ error: 'Consumer ID and billing month (YYYY-MM) are required' });
  }

  const transaction = await sequelize.transaction();
  try {
    const consumer = await Consumer.findByPk(consumerId, {
      include: [{ model: User, as: 'user' }],
      transaction
    });

    if (!consumer) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Consumer not found' });
    }

    // Check if bill already generated for this month
    const existing = await Bill.findOne({
      where: { consumer_id: consumerId, billing_month: billingMonth },
      transaction
    });
    if (existing) {
      await transaction.rollback();
      return res.status(400).json({ error: `Bill has already been generated for consumer in ${billingMonth}` });
    }

    // 1. Gather all consumer meters
    const meters = await Meter.findAll({
      where: { consumer_id: consumerId },
      transaction
    });

    if (meters.length === 0) {
      await transaction.rollback();
      return res.status(400).json({ error: 'Consumer does not have any meters assigned' });
    }

    // 2. Fetch all readings for these meters during that billingMonth
    const meterIds = meters.map(m => m.id);
    const year = parseInt(billingMonth.substring(0, 4), 10);
    const month = parseInt(billingMonth.substring(5, 7), 10);
    const startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
    const endDate = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));

    const readings = await MeterReading.findAll({
      where: {
        meter_id: { [Op.in]: meterIds },
        reading_date: {
          [Op.gte]: startDate,
          [Op.lt]: endDate
        }
      },
      transaction
    });

    const totalUnits = readings.reduce((sum, r) => sum + parseFloat(r.units_consumed), 0);

    // 3. Find active tariff and resolve rate via tariff_engine Lambda
    const tariff = await Tariff.findOne({
      order: [['effective_date', 'DESC'], ['id', 'DESC']],
      transaction
    });
    
    const tariffResult = await invokeLambda(
      process.env.LAMBDA_TARIFF_ENGINE,
      { tariff_name: tariff ? tariff.tariff_name : 'Standard' },
      (payload) => ({ rate_per_unit: tariff ? parseFloat(tariff.rate_per_unit) : 0.15 })
    );
    const rate = tariffResult.rate_per_unit;

    // 4. Calculate total bill amount via bill_generator Lambda
    const billResult = await invokeLambda(
      process.env.LAMBDA_BILL_GENERATOR,
      { units: totalUnits, rate },
      (payload) => ({ amount: parseFloat(payload.units) * parseFloat(payload.rate) })
    );
    const amount = billResult.amount;

    // 5. Build HTML file representing the receipt/bill
    const fileName = `bill_${consumer.consumer_number}_${billingMonth}.html`;

    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Electricity Bill - ${billingMonth}</title>
      <style>
        body { font-family: Arial, sans-serif; background-color: #f7f9fa; margin: 0; padding: 40px; }
        .invoice-box { max-width: 800px; margin: auto; padding: 30px; border: 1px solid #eee; box-shadow: 0 0 10px rgba(0, 0, 0, 0.15); background-color: #fff; border-radius: 8px; }
        .title { color: #008B8B; font-size: 28px; font-weight: bold; margin-bottom: 20px; text-transform: uppercase; border-bottom: 2px solid #008B8B; padding-bottom: 10px; }
        .details-table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        .details-table th, .details-table td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
        .details-table th { background-color: #f2f2f2; color: #333; }
        .total-row { font-weight: bold; font-size: 18px; color: #008B8B; }
        .footer { text-align: center; margin-top: 40px; font-size: 12px; color: #777; }
      </style>
    </head>
    <body>
      <div class="invoice-box">
        <div class="title">SmartGrid Utility Bill</div>
        <table class="details-table">
          <tr>
            <td><strong>Consumer Number:</strong></td>
            <td>${consumer.consumer_number}</td>
            <td><strong>Billing Month:</strong></td>
            <td>${billingMonth}</td>
          </tr>
          <tr>
            <td><strong>Name:</strong></td>
            <td>${consumer.user.name}</td>
            <td><strong>Email:</strong></td>
            <td>${consumer.user.email}</td>
          </tr>
          <tr>
            <td><strong>Phone:</strong></td>
            <td>${consumer.phone}</td>
            <td><strong>Address:</strong></td>
            <td>${consumer.address}</td>
          </tr>
        </table>

        <h3 style="margin-top: 30px; border-bottom: 1px solid #eee; padding-bottom: 5px; color: #333;">Consumption Summary</h3>
        <table class="details-table">
          <thead>
            <tr>
              <th>Description</th>
              <th>Meters Active</th>
              <th>Units Used (kWh)</th>
              <th>Rate (₹/kWh)</th>
              <th>Total Cost</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Electricity Usage</td>
              <td>${meters.length}</td>
              <td>${totalUnits.toFixed(2)}</td>
              <td>₹${rate.toFixed(2)}</td>
              <td>₹${amount.toFixed(2)}</td>
            </tr>
            <tr class="total-row">
              <td colspan="4" style="text-align: right;">Grand Total:</td>
              <td>₹${amount.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>

        <div class="footer">
          Thank you for choosing SmartGrid Utility Management. Keep saving power!<br>
          Generated on: ${new Date().toLocaleString()}
        </div>
      </div>
    </body>
    </html>
    `;

    await uploadBill(fileName, htmlContent);

    // 6. Save Bill record in DB
    const bill = await Bill.create({
      consumer_id: consumerId,
      billing_month: billingMonth,
      units_used: totalUnits,
      amount,
      status: 'PAID', // It is prepaid, so it is registered as paid by default
      pdf_path: fileName
    }, { transaction });

    // 7. Create notification alert for consumer user
    await Notification.create({
      user_id: consumer.user_id,
      title: 'New Monthly Bill Available',
      message: `Your monthly statement for ${billingMonth} is generated. Units used: ${totalUnits.toFixed(2)} kWh. Total statement cost: ₹${amount.toFixed(2)}. Receipt is ready for download.`,
      type: 'BILL'
    }, { transaction });

    await transaction.commit();
    return res.status(201).json({
      message: 'Monthly bill generated and receipt stored.',
      bill
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Bill Generation Error:', error);
    return res.status(500).json({ error: 'Internal server error during bill generation' });
  }
});

// GET download bill PDF receipt
app.get('/api/bills/:id/download', authenticate, async (req, res) => {
  const { id } = req.params;
  try {
    const bill = await Bill.findByPk(id, { include: [{ model: Consumer, as: 'consumer' }] });
    if (!bill) {
      return res.status(404).json({ error: 'Bill statement not found' });
    }

    // Auth verification: consumers can only download their own bills
    if (req.user.role === 'CONSUMER' && bill.consumer.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized to download this statement' });
    }

    try {
      return await downloadBill(bill.pdf_path, res);
    } catch (err) {
      return res.status(404).json({ error: 'Physical receipt file not found in storage' });
    }
  } catch (error) {
    console.error('Download Bill Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE bill (Staff/Supervisor/Admin only)
app.delete('/api/bills/:id', authenticate, authorize(['STAFF', 'SUPERVISOR', 'ADMIN']), async (req, res) => {
  const { id } = req.params;
  try {
    const bill = await Bill.findByPk(id);
    if (!bill) {
      return res.status(404).json({ error: 'Bill not found' });
    }

    // Delete file from S3 / local fallback
    if (bill.pdf_path) {
      const { deleteBill } = require('../../shared/database/s3-helper');
      await deleteBill(bill.pdf_path);
    }

    await bill.destroy();
    return res.status(200).json({ message: 'Bill deleted successfully' });
  } catch (error) {
    console.error('Delete Bill Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled Route Error:', err);
  res.status(500).json({ error: 'An unexpected error occurred' });
});

module.exports = app;
