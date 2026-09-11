// SMTP جعلی SSL (مثل پورت ۴۶۵) برای تست کامل مسیر nodemailer جدید
import net from "node:net";
import tls from "node:tls";
import fs from "node:fs";

const tlsOpts = {
  key: fs.readFileSync("/tmp/smtp-key.pem"),
  cert: fs.readFileSync("/tmp/smtp-cert.pem"),
};
let captured = [];
const server = net.createServer((raw) => {
  raw.once("data", () => {});
  const sock = new tls.TLSSocket(raw, { isServer: true, ...tlsOpts });
  let dataBuf = "";
  let inData = false;
  const send = (l) => sock.write(l + "\r\n");
  send("220 fake-smtp-tls ESMTP ready");
  sock.on("data", (chunk) => {
    const text = chunk.toString();
    if (inData) {
      dataBuf += text;
      if (dataBuf.includes("\r\n.\r\n")) {
        inData = false;
        captured.push(dataBuf.split("\r\n.\r\n")[0]);
        fs.writeFileSync("/tmp/smtp-tls-messages.txt", captured.join("\n=====\n"));
        console.log(`📧 ایمیل دریافت شد (${dataBuf.length} بایت)`);
        send("250 OK queued");
        dataBuf = "";
      }
      return;
    }
    for (const line of text.split("\r\n")) {
      if (!line) continue;
      const c = line.toUpperCase();
      if (c.startsWith("EHLO") || c.startsWith("HELO")) send("250-fake greets\r\n250 AUTH LOGIN PLAIN");
      else if (c.startsWith("AUTH")) send("235 OK");
      else if (c.startsWith("MAIL FROM")) send("250 OK");
      else if (c.startsWith("RCPT TO")) send("250 OK");
      else if (c === "DATA") { inData = true; send("354 go"); }
      else if (c === "QUIT") { send("221 bye"); sock.end(); }
      else send("250 OK");
    }
  });
});
server.listen(2465, "127.0.0.1", () => console.log("📮 SMTP/SSL جعلی روی 127.0.0.1:2465"));
