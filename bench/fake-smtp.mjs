// یک سرور SMTP جعلی حداقلی برای تست واقعی مسیر nodemailer (پورت ۲۵۲۵)
import net from "node:net";
import fs from "node:fs";

const messages = [];
const server = net.createServer((sock) => {
  let dataBuf = "";
  let inData = false;
  let mailFrom = "";
  let rcpts = [];
  const send = (l) => sock.write(l + "\r\n");
  send("220 fake-smtp ESMTP ready");
  sock.on("data", (chunk) => {
    const text = chunk.toString();
    if (inData) {
      dataBuf += text;
      if (dataBuf.includes("\r\n.\r\n")) {
        inData = false;
        const body = dataBuf.split("\r\n.\r\n")[0];
        messages.push({ from: mailFrom, to: rcpts, body });
        fs.writeFileSync("/tmp/smtp-messages.json", JSON.stringify(messages, null, 2));
        console.log(`📧 پیام دریافت شد: از ${mailFrom} به ${rcpts.join(",")} (${body.length} بایت)`);
        send("250 OK message accepted");
        dataBuf = "";
      }
      return;
    }
    for (const line of text.split("\r\n")) {
      if (!line) continue;
      const cmd = line.toUpperCase();
      if (cmd.startsWith("EHLO") || cmd.startsWith("HELO")) {
        send("250-fake-smtp greets you");
        send("250-AUTH LOGIN PLAIN");
        send("250 OK");
      } else if (cmd.startsWith("AUTH LOGIN")) {
        send("334 " + Buffer.from("Username:").toString("base64"));
      } else if (cmd === (Buffer.from("testuser").toString("base64"))) {
        send("334 " + Buffer.from("Password:").toString("base64"));
      } else if (cmd === Buffer.from("testpass").toString("base64")) {
        send("235 Authentication successful");
      } else if (cmd.startsWith("AUTH PLAIN")) {
        send("235 Authentication successful");
      } else if (cmd.startsWith("MAIL FROM")) {
        mailFrom = line;
        send("250 OK");
      } else if (cmd.startsWith("RCPT TO")) {
        rcpts.push(line);
        send("250 OK");
      } else if (cmd === "DATA") {
        inData = true;
        send("354 Start mail input");
      } else if (cmd === "RSET") {
        mailFrom = ""; rcpts = []; dataBuf = "";
        send("250 OK");
      } else if (cmd === "QUIT") {
        send("221 Bye"); sock.end();
      } else {
        send("250 OK");
      }
    }
  });
});
server.listen(2525, "127.0.0.1", () => console.log("📮 SMTP جعلی روی 127.0.0.1:2525"));
