const Sentry = require("@sentry/node");

Sentry.init({
  dsn: "https://6f0db6bf509534a8f471d889f2c95ac5@o4511073012613120.ingest.de.sentry.io/4511073021001808",
  environment: process.env.NODE_ENV || "development",
  tracesSampleRate: 1.0,
  sendDefaultPii: false,
});

module.exports = Sentry;
