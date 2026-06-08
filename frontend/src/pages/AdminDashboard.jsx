import React, { useState, useEffect } from 'react';
import { authApi, billingApi, consumerApi, meterApi } from '../utils/api';
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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  MenuItem,
  Chip,
  Tabs,
  Tab,
  Divider
} from '@mui/material';
import {
  AdminPanelSettings as AdminIcon,
  People as UsersIcon,
  AttachMoney as TariffsIcon,
  Settings as SettingsIcon,
  Dashboard as AnalyticsIcon,
  Add as AddIcon
} from '@mui/icons-material';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

const AdminDashboard = () => {
  const [activeTab, setActiveTab] = useState(0);
  const [users, setUsers] = useState([]);
  const [tariffs, setTariffs] = useState([]);
  const [consumers, setConsumers] = useState([]);
  const [meters, setMeters] = useState([]);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Modals
  const [openRegisterUser, setOpenRegisterUser] = useState(false);
  const [openCreateTariff, setOpenCreateTariff] = useState(false);
  const [openEditUser, setOpenEditUser] = useState(false);

  // Form Inputs
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '', role: 'STAFF' });
  const [newTariff, setNewTariff] = useState({ tariff_name: '', rate_per_unit: '', date: '' });
  const [editUserData, setEditUserData] = useState({ id: '', name: '', email: '', password: '', status: 'ACTIVE' });

  const fetchData = async () => {
    setLoading(true);
    try {
      const uRes = await authApi.get('/auth/users');
      console.log('[DEBUG] AdminDashboard Users Response:', uRes.data);
      setUsers(Array.isArray(uRes.data) ? uRes.data : []);

      const tRes = await billingApi.get('/tariffs');
      console.log('[DEBUG] AdminDashboard Tariffs Response:', tRes.data);
      setTariffs(Array.isArray(tRes.data) ? tRes.data : []);

      const cRes = await consumerApi.get('/consumers');
      console.log('[DEBUG] AdminDashboard Consumers Response:', cRes.data);
      setConsumers(Array.isArray(cRes.data) ? cRes.data : []);

      const mRes = await meterApi.get('/meters');
      console.log('[DEBUG] AdminDashboard Meters Response:', mRes.data);
      setMeters(Array.isArray(mRes.data) ? mRes.data : []);
    } catch (err) {
      console.error('[ERROR] AdminDashboard fetchData error:', err);
      setError('Error fetching administrative records.');
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

  // Register user (Admin creation)
  const handleRegisterUser = async () => {
    if (!newUser.name || !newUser.email || !newUser.password) {
      setError('Please fill in all fields.');
      return;
    }
    setError('');
    try {
      await authApi.post('/auth/register', newUser);
      setSuccess('User created successfully!');
      setNewUser({ name: '', email: '', password: '', role: 'STAFF' });
      fetchData();
      setTimeout(() => {
        setOpenRegisterUser(false);
        setSuccess('');
      }, 1500);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create user.');
    }
  };

  // Edit user (status and details)
  const handleOpenEditUser = (u) => {
    setEditUserData({ id: u.id, name: u.name, email: u.email, password: '', status: u.status });
    setOpenEditUser(true);
  };

  const handleEditUser = async () => {
    if (!editUserData.name || !editUserData.email) {
      setError('Name and Email are required.');
      return;
    }
    setError('');
    try {
      const updatePayload = {
        name: editUserData.name,
        email: editUserData.email,
        status: editUserData.status
      };
      if (editUserData.password) {
        updatePayload.password = editUserData.password;
      }
      await authApi.put(`/auth/users/${editUserData.id}`, updatePayload);
      setSuccess('User updated successfully!');
      fetchData();
      setTimeout(() => {
        setOpenEditUser(false);
        setSuccess('');
      }, 1500);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update user.');
    }
  };

  // Configure Tariff
  const handleCreateTariff = async () => {
    if (!newTariff.tariff_name || !newTariff.rate_per_unit || !newTariff.date) {
      setError('Please fill in all fields.');
      return;
    }
    setError('');
    try {
      await billingApi.post('/tariffs', {
        tariff_name: newTariff.tariff_name,
        rate_per_unit: parseFloat(newTariff.rate_per_unit),
        effective_date: newTariff.date
      });
      setSuccess('Tariff schema created successfully!');
      setNewTariff({ tariff_name: '', rate_per_unit: '', date: '' });
      fetchData();
      setTimeout(() => {
        setOpenCreateTariff(false);
        setSuccess('');
      }, 1500);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to configure tariff.');
    }
  };

  // Statistics Data
  const safeUsers = Array.isArray(users) ? users : [];
  const adminCount = safeUsers.filter(u => u?.role === 'ADMIN').length;
  const supervisorCount = safeUsers.filter(u => u?.role === 'SUPERVISOR').length;
  const staffCount = safeUsers.filter(u => u?.role === 'STAFF').length;
  const consumerCountData = safeUsers.filter(u => u?.role === 'CONSUMER').length;

  const usersRoleChartData = [
    { name: 'Admin', count: adminCount },
    { name: 'Supervisor', count: supervisorCount },
    { name: 'Staff', count: staffCount },
    { name: 'Consumer', count: consumerCountData }
  ];

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 4, fontFamily: 'Outfit', fontWeight: 800 }}>
        Super Admin Control Panel
      </Typography>

      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={activeTab} onChange={handleTabChange} textColor="secondary" indicatorColor="secondary">
          <Tab label="Analytics" icon={<AnalyticsIcon />} iconPosition="start" />
          <Tab label="User Accounts" icon={<UsersIcon />} iconPosition="start" />
          <Tab label="Tariff Rates" icon={<TariffsIcon />} iconPosition="start" />
          <Tab label="System Settings" icon={<SettingsIcon />} iconPosition="start" />
        </Tabs>
      </Box>

      {/* 1. ANALYTICS PANEL */}
      {activeTab === 0 && (
        <Grid container spacing={3}>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent sx={{ textAlign: 'center' }}>
                <Typography variant="subtitle2" color="textSecondary" sx={{ fontWeight: 600 }}>
                  Total System Users
                </Typography>
                <Typography variant="h3" sx={{ fontWeight: 800, mt: 1, fontFamily: 'Outfit' }}>
                  {users.length}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent sx={{ textAlign: 'center' }}>
                <Typography variant="subtitle2" color="textSecondary" sx={{ fontWeight: 600 }}>
                  Consumers Profiles
                </Typography>
                <Typography variant="h3" sx={{ fontWeight: 800, mt: 1, fontFamily: 'Outfit' }}>
                  {consumers.length}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent sx={{ textAlign: 'center' }}>
                <Typography variant="subtitle2" color="textSecondary" sx={{ fontWeight: 600 }}>
                  Smart Meters Active
                </Typography>
                <Typography variant="h3" sx={{ fontWeight: 800, mt: 1, fontFamily: 'Outfit' }}>
                  {meters.length}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent sx={{ textAlign: 'center' }}>
                <Typography variant="subtitle2" color="textSecondary" sx={{ fontWeight: 600 }}>
                  Current Tariffs Defined
                </Typography>
                <Typography variant="h3" sx={{ fontWeight: 800, mt: 1, fontFamily: 'Outfit' }}>
                  {tariffs.length}
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          {/* Bar Chart of User Roles */}
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" sx={{ mb: 3, color: '#26C6DA', fontFamily: 'Outfit', fontWeight: 700 }}>
                  Platform Account Distribution (By Role)
                </Typography>
                <Box sx={{ height: 260, width: '100%' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={usersRoleChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(38, 198, 218, 0.05)" />
                      <XAxis dataKey="name" stroke="#B0BEC5" fontSize={11} />
                      <YAxis stroke="#B0BEC5" fontSize={11} />
                      <Tooltip contentStyle={{ backgroundColor: '#102733', border: '1px solid rgba(0, 183, 194, 0.3)' }} />
                      <Bar dataKey="count" fill="#26C6DA" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* 2. USER ACCOUNTS PANEL */}
      {activeTab === 1 && (
        <Box>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 3 }}>
            <Button variant="contained" color="primary" startIcon={<AddIcon />} onClick={() => setOpenRegisterUser(true)}>
              Add System User
            </Button>
          </Box>
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>ID</TableCell>
                  <TableCell>Name</TableCell>
                  <TableCell>Email</TableCell>
                  <TableCell>Role</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Registered At</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(Array.isArray(users) ? users : []).map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>{u.id}</TableCell>
                    <TableCell><strong>{u.name}</strong></TableCell>
                    <TableCell>{u.email}</TableCell>
                    <TableCell>
                      <Chip label={u.role} color={u.role === 'ADMIN' ? 'error' : u.role === 'SUPERVISOR' ? 'warning' : 'info'} size="small" />
                    </TableCell>
                    <TableCell>
                      <Chip label={u.status} color={u.status === 'ACTIVE' ? 'success' : 'default'} size="small" />
                    </TableCell>
                    <TableCell>{new Date(u.created_at).toLocaleDateString()}</TableCell>
                    <TableCell align="right">
                      <Button size="small" variant="outlined" color="secondary" onClick={() => handleOpenEditUser(u)}>
                        Edit / Toggle Status
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}

      {/* 3. TARIFF PANEL */}
      {activeTab === 2 && (
        <Box>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 3 }}>
            <Button variant="contained" color="primary" startIcon={<AddIcon />} onClick={() => setOpenCreateTariff(true)}>
              Configure New Tariff
            </Button>
          </Box>
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>ID</TableCell>
                  <TableCell>Tariff Plan Name</TableCell>
                  <TableCell>Rate Per kWh ($)</TableCell>
                  <TableCell>Effective Date</TableCell>
                  <TableCell>Created At</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(Array.isArray(tariffs) ? tariffs : []).map((t) => (
                  <TableRow key={t.id}>
                    <TableCell>{t.id}</TableCell>
                    <TableCell><strong>{t.tariff_name}</strong></TableCell>
                    <TableCell sx={{ fontWeight: 'bold', color: '#00B7C2' }}>
                      ${parseFloat(t.rate_per_unit).toFixed(2)}
                    </TableCell>
                    <TableCell>{t.effective_date}</TableCell>
                    <TableCell>{new Date(t.created_at).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}

      {/* 4. SYSTEM SETTINGS PANEL */}
      {activeTab === 3 && (
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="h6" sx={{ mb: 2, color: '#26C6DA', fontFamily: 'Outfit' }}>
                  Microservices Ports Config
                </Typography>
                <Divider sx={{ mb: 2 }} />
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2">Auth Microservice:</Typography>
                    <Chip label="Port 3001" variant="outlined" size="small" color="primary" />
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2">Consumer Microservice:</Typography>
                    <Chip label="Port 3002" variant="outlined" size="small" color="primary" />
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2">Meter Microservice:</Typography>
                    <Chip label="Port 3003" variant="outlined" size="small" color="primary" />
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2">Billing Microservice:</Typography>
                    <Chip label="Port 3004" variant="outlined" size="small" color="primary" />
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2">Alert Microservice:</Typography>
                    <Chip label="Port 3005" variant="outlined" size="small" color="primary" />
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="h6" sx={{ mb: 2, color: '#26C6DA', fontFamily: 'Outfit' }}>
                  System Information
                </Typography>
                <Divider sx={{ mb: 2 }} />
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  <Typography variant="body2"><strong>OS Deployment Target:</strong> Ubuntu 22.04 LTS (EC2)</Typography>
                  <Typography variant="body2"><strong>Engine Runtime:</strong> Node.js v18+</Typography>
                  <Typography variant="body2"><strong>Primary Relational DB:</strong> MySQL Community Server</Typography>
                  <Typography variant="body2"><strong>Process Monitor:</strong> PM2 Cluster Mode</Typography>
                  <Typography variant="body2"><strong>Proxy Server:</strong> Nginx Web Server</Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* DIALOGS */}

      {/* 1. Register User Dialog */}
      <Dialog open={openRegisterUser} onClose={() => setOpenRegisterUser(false)}>
        <DialogTitle sx={{ backgroundColor: '#102733' }}>Create System User Account</DialogTitle>
        <DialogContent sx={{ backgroundColor: '#102733', pt: 2, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 340 }}>
          {error && <Alert severity="error">{error}</Alert>}
          {success && <Alert severity="success">{success}</Alert>}
          <TextField label="User Full Name" value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} fullWidth />
          <TextField label="Email Address" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} fullWidth />
          <TextField label="Secure Password" type="password" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} fullWidth />
          <TextField
            select
            label="Assigned System Role"
            value={newUser.role}
            onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
            fullWidth
          >
            <MenuItem value="STAFF">STAFF</MenuItem>
            <MenuItem value="SUPERVISOR">SUPERVISOR</MenuItem>
            <MenuItem value="ADMIN">ADMIN</MenuItem>
          </TextField>
        </DialogContent>
        <DialogActions sx={{ backgroundColor: '#102733' }}>
          <Button onClick={() => setOpenRegisterUser(false)} color="inherit">Cancel</Button>
          <Button onClick={handleRegisterUser} color="secondary" variant="contained">Create</Button>
        </DialogActions>
      </Dialog>

      {/* 2. Edit User Dialog */}
      <Dialog open={openEditUser} onClose={() => setOpenEditUser(false)}>
        <DialogTitle sx={{ backgroundColor: '#102733' }}>Modify User Settings</DialogTitle>
        <DialogContent sx={{ backgroundColor: '#102733', pt: 2, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 340 }}>
          {error && <Alert severity="error">{error}</Alert>}
          {success && <Alert severity="success">{success}</Alert>}
          <TextField label="User Full Name" value={editUserData.name} onChange={(e) => setEditUserData({ ...editUserData, name: e.target.value })} fullWidth />
          <TextField label="Email Address" value={editUserData.email} onChange={(e) => setEditUserData({ ...editUserData, email: e.target.value })} fullWidth />
          <TextField label="New Password (Leave blank to keep current)" type="password" value={editUserData.password} onChange={(e) => setEditUserData({ ...editUserData, password: e.target.value })} fullWidth />
          <TextField
            select
            label="System Status"
            value={editUserData.status}
            onChange={(e) => setEditUserData({ ...editUserData, status: e.target.value })}
            fullWidth
          >
            <MenuItem value="ACTIVE">ACTIVE</MenuItem>
            <MenuItem value="INACTIVE">INACTIVE</MenuItem>
          </TextField>
        </DialogContent>
        <DialogActions sx={{ backgroundColor: '#102733' }}>
          <Button onClick={() => setOpenEditUser(false)} color="inherit">Cancel</Button>
          <Button onClick={handleEditUser} color="secondary" variant="contained">Save Changes</Button>
        </DialogActions>
      </Dialog>

      {/* 3. Configure Tariff Dialog */}
      <Dialog open={openCreateTariff} onClose={() => setOpenCreateTariff(false)}>
        <DialogTitle sx={{ backgroundColor: '#102733' }}>Configure Tariff Plan</DialogTitle>
        <DialogContent sx={{ backgroundColor: '#102733', pt: 2, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 340 }}>
          {error && <Alert severity="error">{error}</Alert>}
          {success && <Alert severity="success">{success}</Alert>}
          <TextField label="Tariff Name" placeholder="e.g. Standard Peak Tariff" value={newTariff.tariff_name} onChange={(e) => setNewTariff({ ...newTariff, tariff_name: e.target.value })} fullWidth />
          <TextField label="Rate ($ per kWh)" type="number" placeholder="e.g. 0.18" value={newTariff.rate_per_unit} onChange={(e) => setNewTariff({ ...newTariff, rate_per_unit: e.target.value })} fullWidth />
          <TextField
            type="date"
            label="Effective Date"
            InputLabelProps={{ shrink: true }}
            value={newTariff.date}
            onChange={(e) => setNewTariff({ ...newTariff, date: e.target.value })}
            fullWidth
          />
        </DialogContent>
        <DialogActions sx={{ backgroundColor: '#102733' }}>
          <Button onClick={() => setOpenCreateTariff(false)} color="inherit">Cancel</Button>
          <Button onClick={handleCreateTariff} color="secondary" variant="contained">Configure</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default AdminDashboard;
