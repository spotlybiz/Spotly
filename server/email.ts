import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.ethereal.email",
  port: parseInt(process.env.SMTP_PORT || "587"),
  secure: false,
  auth: process.env.SMTP_USER ? {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  } : undefined,
});

export async function sendVerificationEmail(
  email: string,
  token: string,
  baseUrl: string
): Promise<boolean> {
  const verificationUrl = `${baseUrl}/verify-email?token=${token}`;
  
  try {
    if (process.env.NODE_ENV === "development" && !process.env.SMTP_HOST) {
      console.log("=================================");
      console.log("EMAIL VERIFICATION (Development)");
      console.log("=================================");
      console.log(`To: ${email}`);
      console.log(`Verification URL: ${verificationUrl}`);
      console.log(`Token: ${token}`);
      console.log("=================================");
      return true;
    }

    await transporter.sendMail({
      from: process.env.SMTP_FROM || '"Spotly" <noreply@spotly.app>',
      to: email,
      subject: "Verify your Spotly account",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #3b82f6;">Welcome to Spotly!</h1>
          <p>Thank you for signing up. Please verify your email address to start discovering local events.</p>
          <a href="${verificationUrl}" style="
            display: inline-block;
            background-color: #3b82f6;
            color: white;
            padding: 12px 24px;
            text-decoration: none;
            border-radius: 8px;
            margin: 16px 0;
          ">Verify Email</a>
          <p style="color: #6b7280; font-size: 14px;">
            If you didn't create an account, you can ignore this email.
          </p>
          <p style="color: #6b7280; font-size: 14px;">
            This link expires in 24 hours.
          </p>
        </div>
      `,
    });
    
    return true;
  } catch (error) {
    console.error("Failed to send verification email:", error);
    return false;
  }
}

export async function sendPasswordResetEmail(
  email: string,
  token: string,
  baseUrl: string
): Promise<boolean> {
  const resetUrl = `${baseUrl}/reset-password?token=${token}`;
  
  try {
    if (process.env.NODE_ENV === "development" && !process.env.SMTP_HOST) {
      console.log("=================================");
      console.log("PASSWORD RESET (Development)");
      console.log("=================================");
      console.log(`To: ${email}`);
      console.log(`Reset URL: ${resetUrl}`);
      console.log(`Token: ${token}`);
      console.log("=================================");
      return true;
    }

    await transporter.sendMail({
      from: process.env.SMTP_FROM || '"Spotly" <noreply@spotly.app>',
      to: email,
      subject: "Reset your Spotly password",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #3b82f6;">Password Reset</h1>
          <p>You requested to reset your password. Click the button below to continue:</p>
          <a href="${resetUrl}" style="
            display: inline-block;
            background-color: #3b82f6;
            color: white;
            padding: 12px 24px;
            text-decoration: none;
            border-radius: 8px;
            margin: 16px 0;
          ">Reset Password</a>
          <p style="color: #6b7280; font-size: 14px;">
            If you didn't request this, you can ignore this email.
          </p>
          <p style="color: #6b7280; font-size: 14px;">
            This link expires in 1 hour.
          </p>
        </div>
      `,
    });
    
    return true;
  } catch (error) {
    console.error("Failed to send password reset email:", error);
    return false;
  }
}
