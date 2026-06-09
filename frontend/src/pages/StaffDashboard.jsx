import React, { useState, useEffect } from 'react';
import { consumerApi, meterApi, billingApi, authApi } from '../utils/api';
import {
  Grid,
  Card,
  CardContent,
  Typography,
  Box,
  Button,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Tabs,
  Tab,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  MenuItem,
  Chip,
  IconButton
} from '@mui/material';
import {
  People as PeopleIcon,
  FlashOn as ReadingsIcon,
  Receipt as BillIcon,
  AccountBalanceWallet as RechargeIcon,
  AssignmentTurnedIn as AssignIcon,
  Add as AddIcon,
  Delete as DeleteIcon
} from '@mui/icons-material';

const StaffDashboard = () => {
  const [activeTab, setActiveTab] = useState(0);
  const [consumers, setConsumers] = useState([]);
  const [meters, setMeters] = useState([]);
  const [bills, setBills] = useState([]);
  const [recharges, setRecharges] = useState([]);
  const [tariffs, setTariffs] = useState([]);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Modals visibility states
  const [openRegisterConsumer, setOpenRegisterConsumer] = useState(false);
  const [openAssignMeter, setOpenAssignMeter] = useState(false);
  const [openCreateMeter, setOpenCreateMeter] = useState(false);
  const [openAddReading, setOpenAddReading] = useState(false);
  const [openGenerateBill, setOpenGenerateBill] = useState(false);
  const [openRecharge, setOpenRecharge] = useState(false);

  // Form Inputs
  const [newConsumer, setNewConsumer] = useState({ name: '', email: '', password: '', address: '', phone: '' });
  const [assignMeterData, setAssignMeterData] = useState({ consumerId: '', meterId: '', date: '' });
  const [newMeterNumber, setNewMeterNumber] = useState('');
  const [newReading, setNewReading] = useState({ meterId: '', units: '' });
  const [newBillData, setNewBillData] = useState({ consumerId: '', month: '' });
  const [newRechargeData, setNewRechargeData] = useState({ consumerId: '', amount: '' });

  const fetchData = async () => {
    setLoading(true);
    try {
      const cRes = await consumerApi.get('/consumers');
      console.log('[DEBUG] StaffDashboard Consumers Response:', cRes.data);
      setConsumers(Array.isArray(cRes.data) ? cRes.data : []);
      
      const mRes = await meterApi.get('/meters');
      console.log('[DEBUG] StaffDashboard Meters Response:', mRes.data);
      setMeters(Array.isArray(mRes.data) ? mRes.data : []);
      
      const bRes = await billingApi.get('/bills');
      console.log('[DEBUG] StaffDashboard Bills Response:', bRes.data);
      setBills(Array.isArray(bRes.data) ? bRes.data : []);
      
      const rRes = await billingApi.get('/recharges');
      console.log('[DEBUG] StaffDashboard Recharges Response:', rRes.data);
      setRecharges(Array.isArray(rRes.data) ? rRes.data : []);

      const tRes = await billingApi.get('/tariffs');
      console.log('[DEBUG] StaffDashboard Tariffs Response:', tRes.data);
      setTariffs(Array.isArray(tRes.data) ? tRes.data : []);
    } catch (err) {
      console.error('[ERROR] StaffDashboard fetchData error:', err);
      setError('Failed to fetch platform records.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
    setError('');
    setSuccess('');
  };

  // 1. Register Consumer
  const handleRegisterConsumer = async () => {
    if (!newConsumer.name || !newConsumer.email || !newConsumer.password || !newConsumer.address || !newConsumer.phone) {
      setError('Please fill in all fields.');
      return;
    }
    setError('');
    try {
      await authApi.post('/auth/register', { ...newConsumer, role: 'CONSUMER' });
      setSuccess('Consumer registered successfully!');
      setNewConsumer({ name: '', email: '', password: '', address: '', phone: '' });
      fetchData();
      setTimeout(() => {
        setOpenRegisterConsumer(false);
        setSuccess('');
      }, 1500);
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed.');
    }
  };

  // 2. Provision / Create Meter
  const handleCreateMeter = async () => {
    if (!newMeterNumber) {
      setError('Meter number is required.');
      return;
    }
    setError('');
    try {
      await meterApi.post('/meters', { meter_number: newMeterNumber });
      setSuccess('Meter provisioned successfully!');
      setNewMeterNumber('');
      fetchData();
      setTimeout(() => {
        setOpenCreateMeter(false);
        setSuccess('');
      }, 1500);
    } catch (err) {
      setError(err.response?.data?.error || 'Meter creation failed.');
    }
  };

  // 3. Assign Meter
  const handleAssignMeter = async () => {
    if (!assignMeterData.consumerId || !assignMeterData.meterId) {
      setError('Please select both consumer and meter.');
      return;
    }
    setError('');
    try {
      await consumerApi.post('/consumers/assign-meter', {
        consumerId: parseInt(assignMeterData.consumerId, 10),
        meterId: parseInt(assignMeterData.meterId, 10),
        installationDate: assignMeterData.date || undefined
      });
      setSuccess('Meter assigned successfully!');
      setAssignMeterData({ consumerId: '', meterId: '', date: '' });
      fetchData();
      setTimeout(() => {
        setOpenAssignMeter(false);
        setSuccess('');
      }, 1500);
    } catch (err) {
      setError(err.response?.data?.error || 'Meter assignment failed.');
    }
  };

  // 4. Add Reading
  const handleAddReading = async () => {
    if (!newReading.meterId || !newReading.units || parseFloat(newReading.units) <= 0) {
      setError('Please provide a valid meter selection and positive units consumed.');
      return;
    }
    setError('');
    try {
      const res = await meterApi.post(`/meters/${newReading.meterId}/readings`, {
        units_consumed: parseFloat(newReading.units)
      });
      setSuccess(res.data.message || 'Reading saved successfully!');
      setNewReading({ meterId: '', units: '' });
      fetchData();
      setTimeout(() => {
        setOpenAddReading(false);
        setSuccess('');
      }, 2500);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit meter reading.');
    }
  };

  // 5. Generate Monthly Bill
  const handleGenerateBill = async () => {
    if (!newBillData.consumerId || !newBillData.month) {
      setError('Please select consumer and enter billing month (YYYY-MM).');
      return;
    }
    setError('');
    try {
      await billingApi.post('/bills/generate', {
        consumerId: parseInt(newBillData.consumerId, 10),
        billingMonth: newBillData.month
      });
      setSuccess('Bill generated and invoice stored successfully!');
      setNewBillData({ consumerId: '', month: '' });
      fetchData();
      setTimeout(() => {
        setOpenGenerateBill(false);
        setSuccess('');
      }, 2000);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to generate monthly bill statement.');
    }
  };

  // 6. Record Offline Recharge
  const handleRecharge = async () => {
    if (!newRechargeData.consumerId || !newRechargeData.amount || parseFloat(newRechargeData.amount) <= 0) {
      setError('Please select a consumer and enter a valid positive amount.');
      return;
    }
    setError('');
    try {
      await billingApi.post('/recharges', {
        consumer_id: parseInt(newRechargeData.consumerId, 10),
        amount: parseFloat(newRechargeData.amount)
      });
      setSuccess('Balance recharged successfully!');
      setNewRechargeData({ consumerId: '', amount: '' });
      fetchData();
      setTimeout(() => {
        setOpenRecharge(false);
        setSuccess('');
      }, 1500);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to recharge account.');
    }
  };

  // 7. Delete Consumer
  const handleDeleteConsumer = async (id) => {
    if (window.confirm("Are you sure you want to permanently delete this consumer profile and their login user account?")) {
      setError('');
      setSuccess('');
      try {
        await consumerApi.delete(`/consumers/${id}`);
        setSuccess('Consumer profile deleted successfully.');
        fetchData();
      } catch (err) {
        setError(err.response?.data?.error || 'Failed to delete consumer.');
      }
    }
  };

  // 8. Delete Meter
  const handleDeleteMeter = async (id) => {
    if (window.confirm("Are you sure you want to permanently delete this smart meter and its reading history?")) {
      setError('');
      setSuccess('');
      try {
        await meterApi.delete(`/meters/${id}`);
        setSuccess('Smart meter deleted successfully.');
        fetchData();
      } catch (err) {
        setError(err.response?.data?.error || 'Failed to delete meter.');
      }
    }
  };

  // 9. Delete Bill
  const handleDeleteBill = async (id) => {
    if (window.confirm("Are you sure you want to delete this bill? This will also remove the statement HTML file from S3 bucket.")) {
      setError('');
      setSuccess('');
      try {
        await billingApi.delete(`/bills/${id}`);
        setSuccess('Bill deleted successfully.');
        fetchData();
      } catch (err) {
        setError(err.response?.data?.error || 'Failed to delete bill.');
      }
    }
  };

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 4, fontFamily: 'Outfit', fontWeight: 800 }}>
        Utility Staff Management Portal
      </Typography>

      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={activeTab} onChange={handleTabChange} textColor="secondary" indicatorColor="secondary">
          <Tab label="Consumers" icon={<PeopleIcon />} iconPosition="start" />
          <Tab label="Meters & Readings" icon={<ReadingsIcon />} iconPosition="start" />
          <Tab label="Billing Logs" icon={<BillIcon />} iconPosition="start" />
          <Tab label="Recharge Logs" icon={<RechargeIcon />} iconPosition="start" />
        </Tabs>
      </Box>

      {/* Tab Panels */}
      
      {/* 1. CONSUMERS PANEL */}
      {activeTab === 0 && (
        <Box>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2, mb: 3 }}>
            <Button variant="outlined" color="secondary" startIcon={<AssignIcon />} onClick={() => setOpenAssignMeter(true)}>
              Assign Meter
            </Button>
            <Button variant="contained" color="primary" startIcon={<AddIcon />} onClick={() => setOpenRegisterConsumer(true)}>
              Register Consumer
            </Button>
          </Box>
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>ID</TableCell>
                  <TableCell>Consumer #</TableCell>
                  <TableCell>Name</TableCell>
                  <TableCell>Email</TableCell>
                  <TableCell>Phone</TableCell>
                  <TableCell>Address</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Prepaid Balance</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(Array.isArray(consumers) ? consumers : []).map((c) => (
                  <TableRow key={c?.id}>
                    <TableCell>{c?.id}</TableCell>
                    <TableCell><strong>{c?.consumer_number}</strong></TableCell>
                    <TableCell>{c?.user?.name || '-'}</TableCell>
                    <TableCell>{c?.user?.email || '-'}</TableCell>
                    <TableCell>{c?.phone}</TableCell>
                    <TableCell>{c?.address}</TableCell>
                    <TableCell>
                      <Chip label={c?.connection_status || 'DISCONNECTED'} color={c?.connection_status === 'CONNECTED' ? 'success' : 'error'} size="small" />
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                      ₹{parseFloat(c?.balance ?? 0).toFixed(2)}
                    </TableCell>
                    <TableCell align="right">
                      <Button size="small" variant="contained" color="error" startIcon={<DeleteIcon />} onClick={() => handleDeleteConsumer(c?.id)}>
                        Delete
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}

      {/* 2. METERS & READINGS PANEL */}
      {activeTab === 1 && (
        <Box>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2, mb: 3 }}>
            <Button variant="outlined" color="secondary" startIcon={<ReadingsIcon />} onClick={() => setOpenAddReading(true)}>
              Add Reading
            </Button>
            <Button variant="contained" color="primary" startIcon={<AddIcon />} onClick={() => setOpenCreateMeter(true)}>
              Provision Meter
            </Button>
          </Box>
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>ID</TableCell>
                  <TableCell>Meter Number</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Installation Date</TableCell>
                  <TableCell>Consumer #</TableCell>
                  <TableCell>Consumer Name</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(Array.isArray(meters) ? meters : []).map((m) => (
                  <TableRow key={m?.id}>
                    <TableCell>{m?.id}</TableCell>
                    <TableCell><strong>{m?.meter_number}</strong></TableCell>
                    <TableCell>
                      <Chip label={m?.status || 'INACTIVE'} color={m?.status === 'ACTIVE' ? 'success' : m?.status === 'TAMPERED' ? 'error' : 'default'} size="small" />
                    </TableCell>
                    <TableCell>{m?.installation_date || 'N/A'}</TableCell>
                    <TableCell>{m?.consumer ? m.consumer.consumer_number : 'Unassigned'}</TableCell>
                    <TableCell>{m?.consumer && m.consumer.user ? m.consumer.user.name : '-'}</TableCell>
                    <TableCell align="right">
                      <Button size="small" variant="contained" color="error" startIcon={<DeleteIcon />} onClick={() => handleDeleteMeter(m?.id)}>
                        Delete
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}

      {/* 3. BILLING PANEL */}
      {activeTab === 2 && (
        <Box>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 3 }}>
            <Button variant="contained" color="primary" startIcon={<BillIcon />} onClick={() => setOpenGenerateBill(true)}>
              Generate Statement
            </Button>
          </Box>
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Bill ID</TableCell>
                  <TableCell>Consumer Number</TableCell>
                  <TableCell>Name</TableCell>
                  <TableCell>Billing Month</TableCell>
                  <TableCell>Units Used</TableCell>
                  <TableCell>Tariff Rate</TableCell>
                  <TableCell>Amount</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(Array.isArray(bills) ? bills : []).map((b) => (
                  <TableRow key={b?.id}>
                    <TableCell>{b?.id}</TableCell>
                    <TableCell><strong>{b?.consumer ? b.consumer.consumer_number : 'N/A'}</strong></TableCell>
                    <TableCell>{b?.consumer && b.consumer.user ? b.consumer.user.name : 'N/A'}</TableCell>
                    <TableCell>{b?.billing_month}</TableCell>
                    <TableCell>{parseFloat(b?.units_used ?? 0).toFixed(2)} kWh</TableCell>
                    <TableCell>₹{((parseFloat(b?.amount ?? 0)) / (parseFloat(b?.units_used ?? 0) || 1)).toFixed(2)}</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>₹{parseFloat(b?.amount ?? 0).toFixed(2)}</TableCell>
                    <TableCell>
                      <Chip label={b?.status || 'PENDING'} color="success" size="small" sx={{ fontWeight: 'bold' }} />
                    </TableCell>
                    <TableCell align="right">
                      <Button size="small" variant="contained" color="error" startIcon={<DeleteIcon />} onClick={() => handleDeleteBill(b?.id)}>
                        Delete
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}

      {/* 4. RECHARGES PANEL */}
      {activeTab === 3 && (
        <Box>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 3 }}>
            <Button variant="contained" color="primary" startIcon={<RechargeIcon />} onClick={() => setOpenRecharge(true)}>
              Record Cash Payment
            </Button>
          </Box>
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Recharge ID</TableCell>
                  <TableCell>Consumer Number</TableCell>
                  <TableCell>Name</TableCell>
                  <TableCell>Recharge Date</TableCell>
                  <TableCell align="right">Amount</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(Array.isArray(recharges) ? recharges : []).map((r) => (
                  <TableRow key={r?.id}>
                    <TableCell>{r?.id}</TableCell>
                    <TableCell><strong>{r?.consumer ? r.consumer.consumer_number : 'N/A'}</strong></TableCell>
                    <TableCell>{r?.consumer && r.consumer.user ? r.consumer.user.name : 'N/A'}</TableCell>
                    <TableCell>{(r?.createdAt || r?.created_at) ? new Date(r.createdAt || r.created_at).toLocaleString() : '-'}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 'bold', color: '#26C6DA' }}>
                      ₹{parseFloat(r?.amount ?? 0).toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}

      {/* MODALS SECTION */}

      {/* 1. Register Consumer Dialog */}
      <Dialog open={openRegisterConsumer} onClose={() => setOpenRegisterConsumer(false)}>
        <DialogTitle sx={{ backgroundColor: '#102733' }}>Register Consumer Profile</DialogTitle>
        <DialogContent sx={{ backgroundColor: '#102733', pt: 2, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 360 }}>
          {error && <Alert severity="error">{error}</Alert>}
          {success && <Alert severity="success">{success}</Alert>}
          <TextField label="Full Name" value={newConsumer.name} onChange={(e) => setNewConsumer({ ...newConsumer, name: e.target.value })} fullWidth />
          <TextField label="Email Address" value={newConsumer.email} onChange={(e) => setNewConsumer({ ...newConsumer, email: e.target.value })} fullWidth />
          <TextField label="Password" type="password" value={newConsumer.password} onChange={(e) => setNewConsumer({ ...newConsumer, password: e.target.value })} fullWidth />
          <TextField label="Phone Number" value={newConsumer.phone} onChange={(e) => setNewConsumer({ ...newConsumer, phone: e.target.value })} fullWidth />
          <TextField label="Physical Address" multiline rows={2} value={newConsumer.address} onChange={(e) => setNewConsumer({ ...newConsumer, address: e.target.value })} fullWidth />
        </DialogContent>
        <DialogActions sx={{ backgroundColor: '#102733' }}>
          <Button onClick={() => setOpenRegisterConsumer(false)} color="inherit">Cancel</Button>
          <Button onClick={handleRegisterConsumer} color="secondary" variant="contained">Register</Button>
        </DialogActions>
      </Dialog>

      {/* 2. Provision Meter Dialog */}
      <Dialog open={openCreateMeter} onClose={() => setOpenCreateMeter(false)}>
        <DialogTitle sx={{ backgroundColor: '#102733' }}>Provision New Smart Meter</DialogTitle>
        <DialogContent sx={{ backgroundColor: '#102733', pt: 2, minWidth: 320 }}>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}
          <TextField label="Meter Serial Number" value={newMeterNumber} onChange={(e) => setNewMeterNumber(e.target.value)} fullWidth />
        </DialogContent>
        <DialogActions sx={{ backgroundColor: '#102733' }}>
          <Button onClick={() => setOpenCreateMeter(false)} color="inherit">Cancel</Button>
          <Button onClick={handleCreateMeter} color="secondary" variant="contained">Create</Button>
        </DialogActions>
      </Dialog>

      {/* 3. Assign Meter Dialog */}
      <Dialog open={openAssignMeter} onClose={() => setOpenAssignMeter(false)}>
        <DialogTitle sx={{ backgroundColor: '#102733' }}>Assign Meter to Consumer</DialogTitle>
        <DialogContent sx={{ backgroundColor: '#102733', pt: 2, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 340 }}>
          {error && <Alert severity="error">{error}</Alert>}
          {success && <Alert severity="success">{success}</Alert>}
          <TextField
            select
            label="Consumer Profile"
            value={assignMeterData.consumerId}
            onChange={(e) => setAssignMeterData({ ...assignMeterData, consumerId: e.target.value })}
            fullWidth
          >
            {(Array.isArray(consumers) ? consumers : []).map((c) => (
              <MenuItem key={c?.id} value={c?.id}>
                {c?.consumer_number} - {c?.user?.name || ''}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Available Meter"
            value={assignMeterData.meterId}
            onChange={(e) => setAssignMeterData({ ...assignMeterData, meterId: e.target.value })}
            fullWidth
          >
            {(Array.isArray(meters) ? meters : []).filter(m => !m?.consumer_id).map((m) => (
              <MenuItem key={m?.id} value={m?.id}>
                {m?.meter_number} (Unassigned)
              </MenuItem>
            ))}
          </TextField>
          <TextField
            type="date"
            label="Installation Date"
            InputLabelProps={{ shrink: true }}
            value={assignMeterData.date}
            onChange={(e) => setAssignMeterData({ ...assignMeterData, date: e.target.value })}
            fullWidth
          />
        </DialogContent>
        <DialogActions sx={{ backgroundColor: '#102733' }}>
          <Button onClick={() => setOpenAssignMeter(false)} color="inherit">Cancel</Button>
          <Button onClick={handleAssignMeter} color="secondary" variant="contained">Assign</Button>
        </DialogActions>
      </Dialog>

      {/* 4. Add Reading Dialog */}
      <Dialog open={openAddReading} onClose={() => setOpenAddReading(false)}>
        <DialogTitle sx={{ backgroundColor: '#102733' }}>Submit Meter Reading</DialogTitle>
        <DialogContent sx={{ backgroundColor: '#102733', pt: 2, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 340 }}>
          {error && <Alert severity="error">{error}</Alert>}
          {success && <Alert severity="success">{success}</Alert>}
          <TextField
            select
            label="Select Active Meter"
            value={newReading.meterId}
            onChange={(e) => setNewReading({ ...newReading, meterId: e.target.value })}
            fullWidth
          >
            {(Array.isArray(meters) ? meters : []).filter(m => m?.consumer_id && m?.status === 'ACTIVE').map((m) => (
              <MenuItem key={m?.id} value={m?.id}>
                {m?.meter_number} - {m?.consumer ? m.consumer.consumer_number : 'Unassigned'}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Units Consumed (kWh)"
            type="number"
            value={newReading.units}
            onChange={(e) => setNewReading({ ...newReading, units: e.target.value })}
            fullWidth
          />
        </DialogContent>
        <DialogActions sx={{ backgroundColor: '#102733' }}>
          <Button onClick={() => setOpenAddReading(false)} color="inherit">Cancel</Button>
          <Button onClick={handleAddReading} color="secondary" variant="contained">Submit Reading</Button>
        </DialogActions>
      </Dialog>

      {/* 5. Generate Bill Dialog */}
      <Dialog open={openGenerateBill} onClose={() => setOpenGenerateBill(false)}>
        <DialogTitle sx={{ backgroundColor: '#102733' }}>Generate Billing Statement</DialogTitle>
        <DialogContent sx={{ backgroundColor: '#102733', pt: 2, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 340 }}>
          {error && <Alert severity="error">{error}</Alert>}
          {success && <Alert severity="success">{success}</Alert>}
          <TextField
            select
            label="Consumer Profile"
            value={newBillData.consumerId}
            onChange={(e) => setNewBillData({ ...newBillData, consumerId: e.target.value })}
            fullWidth
          >
            {(Array.isArray(consumers) ? consumers : []).map((c) => (
              <MenuItem key={c?.id} value={c?.id}>
                {c?.consumer_number} - {c?.user?.name || ''}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Billing Month (YYYY-MM)"
            placeholder="e.g. 2026-06"
            value={newBillData.month}
            onChange={(e) => setNewBillData({ ...newBillData, month: e.target.value })}
            fullWidth
          />
        </DialogContent>
        <DialogActions sx={{ backgroundColor: '#102733' }}>
          <Button onClick={() => setOpenGenerateBill(false)} color="inherit">Cancel</Button>
          <Button onClick={handleGenerateBill} color="secondary" variant="contained">Generate</Button>
        </DialogActions>
      </Dialog>

      {/* 6. Record Offline Recharge Dialog */}
      <Dialog open={openRecharge} onClose={() => setOpenRecharge(false)}>
        <DialogTitle sx={{ backgroundColor: '#102733' }}>Record Offline / Cash Recharge</DialogTitle>
        <DialogContent sx={{ backgroundColor: '#102733', pt: 2, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 340 }}>
          {error && <Alert severity="error">{error}</Alert>}
          {success && <Alert severity="success">{success}</Alert>}
          <TextField
            select
            label="Consumer Profile"
            value={newRechargeData.consumerId}
            onChange={(e) => setNewRechargeData({ ...newRechargeData, consumerId: e.target.value })}
            fullWidth
          >
            {(Array.isArray(consumers) ? consumers : []).map((c) => (
              <MenuItem key={c?.id} value={c?.id}>
                {c?.consumer_number} - {c?.user?.name || ''}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Recharge Amount (₹)"
            type="number"
            value={newRechargeData.amount}
            onChange={(e) => setNewRechargeData({ ...newRechargeData, amount: e.target.value })}
            fullWidth
          />
        </DialogContent>
        <DialogActions sx={{ backgroundColor: '#102733' }}>
          <Button onClick={() => setOpenRecharge(false)} color="inherit">Cancel</Button>
          <Button onClick={handleRecharge} color="secondary" variant="contained">Record Payment</Button>
        </DialogActions>
      </Dialog>

    </Box>
  );
};

export default StaffDashboard;
