import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { env } from "./env";

export const mailConfigured = () => !!(env().SMTP_USER && env().SMTP_PASS);

let transport: Transporter | null = null;
function transporter() {
  if (!transport) {
    const e = env();
    transport = nodemailer.createTransport({
      host: e.SMTP_HOST,
      port: e.SMTP_PORT,
      secure: e.SMTP_PORT === 465,
      auth: { user: e.SMTP_USER, pass: e.SMTP_PASS },
    });
  }
  return transport;
}

export async function sendMail(m: { to: string; subject: string; html: string; text: string; unsubscribeUrl?: string }) {
  if (!mailConfigured()) throw new Error("E-Mail ist nicht eingerichtet (SMTP_USER/SMTP_PASS fehlen)");
  await transporter().sendMail({
    from: env().MAIL_FROM ?? `GameCompass <${env().SMTP_USER}>`,
    to: m.to,
    subject: m.subject,
    html: m.html,
    text: m.text,
    ...(m.unsubscribeUrl ? { list: { unsubscribe: { url: m.unsubscribeUrl, comment: "Benachrichtigungen abbestellen" } } } : {}),
  });
}
