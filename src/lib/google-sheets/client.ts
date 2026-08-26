import "server-only";

import { google, type sheets_v4 } from "googleapis";

const GOOGLE_SHEETS_SCOPE =
  "https://www.googleapis.com/auth/spreadsheets";

type GoogleSheetsConfig = {
  client: sheets_v4.Sheets;
  spreadsheetId: string;
};

export function createGoogleSheetsClient(): GoogleSheetsConfig {
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim();
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const configuredPrivateKey = process.env.GOOGLE_PRIVATE_KEY;

  if (!spreadsheetId || !email || !configuredPrivateKey) {
    throw new Error("GOOGLE_SHEETS_CONFIGURATION_ERROR");
  }

  const auth = new google.auth.JWT({
    email,
    key: configuredPrivateKey.replace(/\\n/g, "\n"),
    scopes: [GOOGLE_SHEETS_SCOPE],
  });

  return {
    client: google.sheets({ auth, version: "v4" }),
    spreadsheetId,
  };
}
