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

// Initialize PayHero client
const client = new PayHeroClient({
  authToken: process.env.AUTH_TOKEN
});

// Serve main subscription page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ---------- STK PUSH WITH VERIFIED STATUS ----------
app.post('/api/stk-push', async (req, res) => {
  try {
    const { phone_number, amount, external_reference, customer_name } = req.body;

    if (!phone_number || !amount) {
      return res.status(400).json({ success: false, error: 'Phone number and amount required' });
    }

    // Format phone
    let formattedPhone = phone_number.trim();
    if (formattedPhone.startsWith('0')) formattedPhone = '254' + formattedPhone.substring(1);
    if (formattedPhone.startsWith('+')) formattedPhone = formattedPhone.substring(1);
    if (!formattedPhone.startsWith('254')) {
      return res.status(400).json({ success: false, error: 'Phone must start with 2547...' });
    }

    // Create STK payload
    const stkPayload = {
      phone_number: formattedPhone,
      amount: parseFloat(amount),
      provider: process.env.DEFAULT_PROVIDER || 'm-pesa',
      channel_id: process.env.CHANNEL_ID,
      external_reference: external_reference || `TRX-${Date.now()}`,
      customer_name: customer_name || 'Customer'
    };

    console.log('🔄 Initiating verified STK push:', stkPayload);
    const response = await client.stkPush(stkPayload);

    if (!response || !response.reference) {
      throw new Error('No reference returned from PayHero STK push');
    }

    const reference = response.reference;
    console.log(`✅ STK Push sent. Reference: ${reference}`);

    // Poll transaction status until completed or timeout (30 seconds)
    const start = Date.now();
    const timeoutMs = 30000;
    let statusResponse = null;

    while (Date.now() - start < timeoutMs) {
      try {
        await new Promise((r) => setTimeout(r, 5000)); // wait 5 seconds before each check
        console.log(`🔍 Checking status for ${reference}...`);

        statusResponse = await client.transactionStatus(reference);
        const status = statusResponse?.status?.toLowerCase?.() || 'unknown';
        console.log('📊 Current status:', status);

        if (status.includes('completed') || status.includes('success')) {
          console.log('✅ Payment confirmed.');
          return res.json({
            success: true,
            verified: true,
            message: 'Payment completed successfully.',
            data: { reference, status: statusResponse.status, details: statusResponse }
          });
        }

        if (status.includes('failed') || status.includes('cancelled')) {
          console.log('❌ Payment failed.');
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

    // Timeout reached
    console.log('⏳ Payment not confirmed within time window.');
    res.json({
      success: false,
      verified: false,
      message: 'Payment pending. Please check manually after a few minutes.',
      data: { reference, details: statusResponse }
    });

  } catch (error) {
    console.error('❌ STK Push Error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to initiate payment'
    });
  }
});

// ---------- Transaction Status ----------
app.get('/api/transaction-status/:reference', async (req, res) => {
  try {
    const { reference } = req.params;
    if (!reference) return res.status(400).json({ success: false, error: 'Reference required' });

    console.log('🔎 Checking transaction status:', reference);
    const result = await client.transactionStatus(reference);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('❌ Status Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ---------- Health Check ----------
app.get('/api/health', async (req, res) => {
  try {
    const balance = await client.serviceWalletBalance();
    res.json({
      success: true,
      message: 'CHEGE TECH SUBSCRIPTIONS Gateway active',
      account_id: process.env.CHANNEL_ID,
      provider: process.env.DEFAULT_PROVIDER,
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

// ---------- Start Server ----------
app.listen(port, () => {
  console.log('🚀 CHEGE TECH SUBSCRIPTIONS LIVE');
  console.log(`📍 Server running on port ${port}`);
  console.log(`🌐 Access: http://localhost:${port}`);
  console.log(`❤️  PayHero Account: ${process.env.CHANNEL_ID}`);
});
