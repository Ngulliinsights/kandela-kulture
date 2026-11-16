'use strict';
const nodemailer = require('nodemailer');

let transporter = null;

function init() {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = process.env.SMTP_SECURE === '1';

  if (!user || !pass) {
    console.warn('SMTP_USER or SMTP_PASS not set: email notifications disabled.');
    return null;
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    tls: { rejectUnauthorized: false },
  });

  return transporter;
}

async function send(to, subject, text) {
  if (!transporter) {
    console.warn('Email not configured: skipping send to', to);
    return false;
  }

  try {
    await transporter.sendMail({
      from: process.env.SMTP_USER,
      to,
      subject,
      text,
    });
    return true;
  } catch (e) {
    console.error('Email send failed:', e.message);
    return false;
  }
}

module.exports = { init, send };
