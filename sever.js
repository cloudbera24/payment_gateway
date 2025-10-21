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

// Initialize PayHero Client
const client = new PayHeroClient({
  authToken: process.env.AUTH_TOKEN
});

// Serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// STK Push Endpoint
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

    const stkPayload = {
      phone_number: formattedPhone,
      amount: parseFloat(amount),
      provider: process.env.DEFAULT_PROVIDER || 'm-pesa',
      channel_id: process.env.CHANNEL_ID || '1234',
      external_reference: external_reference || `TRX-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      customer_name: customer_name || 'Customer'
    };

    console.log('Initiating STK Push:', stkPayload);
    
    const response = await client.stkPush(stkPayload);
    
    res.json({
      success: true,
      message: 'STK push initiated successfully',
      data: response
    });

  } catch (error) {
    console.error('STK Push Error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to initiate STK push'
    });
  }
});

// Transaction Status Endpoint
app.get('/api/transaction-status/:reference', async (req, res) => {
  try {
    const { reference } = req.params;
    
    if (!reference) {
      return res.status(400).json({
        success: false,
        error: 'Transaction reference is required'
      });
    }

    const response = await client.transactionStatus(reference);
    
    res.json({
      success: true,
      data: response
    });

  } catch (error) {
    console.error('Transaction Status Error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get transaction status'
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'STK Push Gateway is running',
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(port, () => {
  console.log(`🚀 STK Push Gateway running on port ${port}`);
  console.log(`📍 Access: http://localhost:${port}`);
  console.log(`✅ Health check: http://localhost:${port}/api/health`);
});
