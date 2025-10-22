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

// Serve main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// -----------------------------------------------------------------------------
// ✅ STK Push Endpoint with Smart Number Formatting + 1 KES Validation + Verification
// -----------------------------------------------------------------------------
app.post('/api/stk-push', async (req, res) => {
  try {
    const { phone_number, amount, external_reference, customer_name } = req.body;

    // Validate fields
    if (!phone_number || amount === undefined || amount === null) {
      return res.status(400).json({
        success: false,
        error: 'Phone number and amount are required'
      });
    }

    const amt = Number(amount);
    if (isNaN(amt) || amt < 1) {
      return res.status(400).json({
        success: false,
        error: 'Amount must be at least 1 KES'
      });
    }

    // Smart Safaricom phone formatting
    let formattedPhone = phone_number.trim();
    formattedPhone = formattedPhone.replace(/\s+/g, '');
    if (formattedPhone.startsWith('+')) formattedPhone = formattedPhone.substring(1);

    // Handle 07xxxxxxx → 2547xxxxxxx
    if (/^07\d{8}$/.test(formattedPhone)) {
      formattedPhone = '254' + formattedPhone.substring(1);
    }

    // Handle 01xxxxxxx → 2541xxxxxxx
    if (/^01\d{8}$/.test(formattedPhone)) {
      formattedPhone = '254' + formattedPhone.substring(1);
    }

    // Validate final number
    if (!/^254(7|1)\d{8}$/.test(formattedPhone)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid phone format. Use 07XXXXXXXX, 01XXXXXXXX, or 2547XXXXXXXX/2541XXXXXXXX.'
      });
    }

    // STK Payload
    const stkPayload = {
      phone_number: formattedPhone,
      amount: amt,
      provider: process.env.DEFAULT_PROVIDER || 'm-pesa',
      channel_id: process.env.CHANNEL_ID, // e.g. 3342
      external_reference: external_reference || `TRX-${Date.now()}`,
      customer_name: customer_name || 'Customer'
    };

    console.log('🔄 Initiating REAL STK Push:', stkPayload);
    const response = await client.stkPush(stkPayload);
    console.log('✅ STK Push Response:', response);

    if (!response || !response.reference) {
      throw new Error('No reference returned from PayHero STK Push');
    }

    const reference = response.reference;

    // -------------------------------------------------------------------------
    // ✅ Optional Verified Status Check (Poll PayHero for confirmation)
    // -------------------------------------------------------------------------
    const start = Date.now();
    const timeoutMs = 30000; // wait 30 seconds max
    let statusResponse = null;

    while (Date.now() - start < timeoutMs) {
      await new Promise((r) => setTimeout(r, 5000)); // wait 5 sec
      try {
        statusResponse = await client.transactionStatus(reference);
        const status = statusResponse?.status?.toLowerCase?.() || 'unknown';
        console.log(`📊 Status for ${reference}:`, status);

        if (status.includes('completed') || status.includes('success')) {
          console.log('✅ Payment confirmed!');
          return res.json({
            success: true,
            verified: true,
            message: 'Payment completed successfully.',
            data: { reference, status: statusResponse.status, details: statusResponse }
          });
        }

        if (status.includes('failed') || status.includes('cancelled')) {
          console.log('❌ Payment failed or cancelled.');
          return res.json({
            success: false,
            verified: true,
            message: 'Payment failed or cancelled.',
            data: { reference, status: statusResponse.status, details: statusResponse }
          });
        }
      } catch (err) {
        console.warn('⚠️ Status check error:', err.message);
      }
    }

    console.log('⏳ Payment not confirmed within 30 seconds.');
    res.json({
      success: false,
      verified: false,
      message: 'Payment pending. Please check manually later.',
      data: { reference, details: statusResponse }
    });

  } catch (error) {
    console.error('❌ STK Push Error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to initiate STK push'
    });
  }
});

// -----------------------------------------------------------------------------
// ✅ Transaction Status Endpoint
// -----------------------------------------------------------------------------
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

// -----------------------------------------------------------------------------
// ✅ Health Check
// -----------------------------------------------------------------------------
app.get('/api/health', async (req, res) => {
  try {
    const balance = await client.serviceWalletBalance();
    res.json({
      success: true,
      message: 'CHEGE TECH SUBSCRIPTIONS Gateway connected',
      account_id: process.env.CHANNEL_ID,
      timestamp: new Date().toISOString(),
      balance
    });
  } catch (error) {
    res.json({
      success: false,
      message: 'Gateway running but PayHero connection failed',
      error: error.message
    });
  }
});

// -----------------------------------------------------------------------------
// ✅ Start Server
// -----------------------------------------------------------------------------
app.listen(port, () => {
  console.log('🚀 CHEGE TECH SUBSCRIPTIONS - VERIFIED STK GATEWAY');
  console.log('📍 Running on port:', port);
  console.log('🔑 Channel ID:', process.env.CHANNEL_ID);
  console.log('🌐 Access: http://localhost:' + port);
  console.log('❤️ Health: http://localhost:' + port + '/api/health');
});
