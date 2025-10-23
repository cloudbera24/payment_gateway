require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { PayHeroClient } = require('payhero-devkit');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// Initialize PayHero Client with YOUR credentials
const client = new PayHeroClient({
  authToken: process.env.AUTH_TOKEN
});

// Serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// STK Push Endpoint - REAL IMPLEMENTATION
app.post('/api/stk-push', async (req, res) => {
  try {
    const { phone_number, amount, external_reference, customer_name } = req.body;

    // Validation
    if (!phone_number || !amount) {
      return res.status(400).json({
        success: false,
        error: 'Phone number and amount are required'
      });
    }

    // Format phone number
    let formattedPhone = phone_number.trim();
    if (formattedPhone.startsWith('0')) {
      formattedPhone = '254' + formattedPhone.substring(1);
    } else if (formattedPhone.startsWith('+')) {
      formattedPhone = formattedPhone.substring(1);
    }

    if (!formattedPhone.startsWith('254')) {
      return res.status(400).json({
        success: false,
        error: 'Phone number must be in format 2547XXXXXXXX'
      });
    }

    // REAL STK Push with your credentials
    const stkPayload = {
      phone_number: formattedPhone,
      amount: parseFloat(amount),
      provider: process.env.DEFAULT_PROVIDER || 'm-pesa',
      channel_id: process.env.CHANNEL_ID, // Your account ID 3342
      external_reference: external_reference || `TRX-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      customer_name: customer_name || 'Customer'
    };

    console.log('🔄 Initiating REAL STK Push:', stkPayload);
    
    const response = await client.stkPush(stkPayload);
    
    console.log('✅ STK Push Response:', response);
    
    res.json({
      success: true,
      message: 'STK push initiated successfully',
      data: response
    });

  } catch (error) {
    console.error('❌ STK Push Error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to initiate STK push'
    });
  }
});

// Transaction Status Endpoint - REAL IMPLEMENTATION
app.get('/api/transaction-status/:reference', async (req, res) => {
  try {
    const { reference } = req.params;
    
    if (!reference) {
      return res.status(400).json({
        success: false,
        error: 'Transaction reference is required'
      });
    }

    console.log('🔄 Checking REAL transaction status:', reference);
    const response = await client.transactionStatus(reference);
    console.log('✅ Status Response:', response);
    
    res.json({
      success: true,
      data: response
    });

  } catch (error) {
    console.error('❌ Transaction Status Error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get transaction status'
    });
  }
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    // Test the connection by checking service wallet balance
    const balance = await client.serviceWalletBalance();
    
    res.json({
      success: true,
      message: 'STK Push Gateway is running and connected to PayHero',
      account_id: process.env.CHANNEL_ID,
      timestamp: new Date().toISOString(),
      balance: balance
    });
  } catch (error) {
    res.json({
      success: false,
      message: 'Gateway running but PayHero connection failed',
      error: error.message
    });
  }
});

// Start server
app.listen(port, () => {
  console.log('🚀 STK Push Gateway - REAL IMPLEMENTATION');
  console.log('📍 Server running on port:', port);
  console.log('🔑 Account ID:', process.env.CHANNEL_ID);
  console.log('📱 Provider:', process.env.DEFAULT_PROVIDER);
  console.log('🌐 Access: http://localhost:' + port);
  console.log('❤️  Health: http://localhost:' + port + '/api/health');
});
