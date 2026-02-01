
import sendgrid from "@sendgrid/mail";

// SendGrid credentials from environment variables
const apiKey = process.env.SENDGRID_API_KEY;
const fromEmail = process.env.SENDGRID_FROM_EMAIL;

if (apiKey) {
  sendgrid.setApiKey(apiKey);
} else {
  console.warn("⚠️ SendGrid API Key missing. Email service will be disabled.");
}

interface ReturnPassportEmailPayload {
  to: string;
  customerName: string;
  orderName: string;
  proofUrl: string;
  merchantName?: string;
  photoUrls?: string[];  // 4 enrollment photos
  returnWindowDays?: number;  // Return window (e.g., 30 days)
  returnUrl?: string;  // URL to start return
  productImageUrl?: string; // Main product image
}

// Legacy interface for backward compatibility
interface EmailPayload {
  to: string;
  customerName: string;
  orderName: string;
  proofUrl: string;
  merchantName?: string;
}

export const EmailService = {
  /**
   * Sends the Return Passport email after delivery is unlocked.
   * Includes: Enrollment photos, return window info, "Start Return" CTA
   */
  async sendReturnPassportEmail(payload: ReturnPassportEmailPayload): Promise<boolean> {
    if (!apiKey || !fromEmail) {
      console.error("❌ Cannot send email: SendGrid credentials missing.");
      return false;
    }

    const { 
      to, 
      customerName, 
      orderName, 
      proofUrl, 
      merchantName = "InInk Verified Merchant",
      photoUrls = [],
      returnWindowDays = 30,
      returnUrl,
      productImageUrl
    } = payload;

    // Determine return button URL
    const returnButtonUrl = returnUrl || proofUrl;

    // Premium HTML Template
    const htmlContent = `
      <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
      <html xmlns="http://www.w3.org/1999/xhtml">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
        <title>Delivery Unlocked - ${orderName}</title>
        <style type="text/css">
          @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Inter:wght@400;500;600&display=swap');
          
          body {
            width: 100% !important;
            height: 100%;
            margin: 0;
            padding: 0;
            background-color: #f8f8f8;
            font-family: 'Inter', Helvetica, Arial, sans-serif;
            -webkit-font-smoothing: antialiased;
          }
          
          .email-container {
            max-width: 600px;
            margin: 0 auto;
            background-color: #ffffff;
            overflow: hidden;
            box-shadow: 0 4px 20px rgba(0,0,0,0.05);
          }

          .header {
            background-color: #000000;
            padding: 30px 40px;
            text-align: center;
          }

          .header-title {
            color: #ffffff;
            font-family: 'Playfair Display', serif;
            font-size: 24px;
            letter-spacing: 0.5px;
            margin: 0;
          }
          
          .content {
            padding: 40px;
            text-align: center;
          }

          .order-badge {
            display: inline-block;
            background-color: #f0f0f0;
            color: #000000;
            padding: 6px 12px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 600;
            letter-spacing: 1px;
            margin-bottom: 24px;
            text-transform: uppercase;
          }

          .main-heading {
            font-family: 'Playfair Display', serif;
            font-size: 32px;
            color: #000000;
            margin: 0 0 16px 0;
            line-height: 1.2;
          }

          .sub-heading {
            font-size: 16px;
            color: #555555;
            line-height: 1.6;
            margin: 0 0 32px 0;
            max-width: 480px;
            margin-left: auto;
            margin-right: auto;
          }

          .product-image {
            width: 100%;
            max-width: 300px;
            height: auto;
            border-radius: 8px;
            margin-bottom: 32px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.08);
          }

          .cta-button {
            display: inline-block;
            background-color: #000000;
            color: #ffffff;
            text-decoration: none;
            padding: 16px 40px;
            border-radius: 2px;
            font-weight: 500;
            font-size: 14px;
            letter-spacing: 1px;
            text-transform: uppercase;
            transition: opacity 0.2s;
          }

          .info-grid {
            margin-top: 48px;
            border-top: 1px solid #eeeeee;
            padding-top: 32px;
            text-align: left;
          }

          .info-item {
            margin-bottom: 16px;
          }

          .info-label {
            font-size: 12px;
            color: #888888;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 4px;
          }

          .info-value {
            font-size: 14px;
            color: #000000;
            font-weight: 500;
          }

          .footer {
            background-color: #f8f8f8;
            padding: 30px 40px;
            text-align: center;
            font-size: 12px;
            color: #999999;
          }
          
          /* Mobile styles */
          @media only screen and (max-width: 600px) {
            .email-container { width: 100% !important; }
            .content { padding: 30px 20px !important; }
            .main-heading { font-size: 28px !important; }
          }
        </style>
      </head>
      <body>
        <div class="email-container">
          <!-- Header -->
          <div class="header">
            <h1 class="header-title">ink. Verified Delivery</h1>
          </div>

          <!-- Main Content -->
          <div class="content">
            <div class="order-badge">Order ${orderName}</div>
            
            <h2 class="main-heading">Delivery Unlocked</h2>
            <p class="sub-heading">
              Hi ${customerName}, your package from <strong>${merchantName}</strong> has been successfully verified and unlocked.
            </p>

            ${productImageUrl ? `
              <img src="${productImageUrl}" alt="Product" class="product-image" />
            ` : ''}

            <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td align="center">
                   <a href="${returnButtonUrl}" class="cta-button">
                     Start Return
                   </a>
                </td>
              </tr>
            </table>

            <div style="margin-top: 24px; text-align: center;">
              <p style="font-size: 14px; color: #666; margin-bottom: 8px;">Or copy this link:</p>
              <a href="${proofUrl}" style="color: #999; text-decoration: underline; font-size: 13px; word-break: break-all;">
                ${proofUrl}
              </a>
            </div>

            <!-- Photos Section (if needed) -->
            ${photoUrls.length > 0 ? `
              <div style="margin-top: 40px; text-align: left;">
                <p style="font-size: 13px; font-weight: 600; color: #000; margin-bottom: 12px;">ENROLLMENT PHOTOS</p>
                <div style="white-space: nowrap; overflow-x: auto; padding-bottom: 10px;">
                  ${photoUrls.slice(0, 3).map(url => `
                    <div style="display: inline-block; width: 80px; height: 80px; margin-right: 8px; border-radius: 4px; background-color: #eee; overflow: hidden; vertical-align: top;">
                        <img src="${url}" style="width: 100%; height: 100%; object-fit: cover;" alt="Enrollment Photo" />
                    </div>
                  `).join('')}
                </div>
              </div>
            ` : ''}
            
            <!-- Details Grid -->
            <div class="info-grid">
               <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                 <tr>
                    <td valign="top" width="50%" style="padding-bottom: 20px;">
                        <div class="info-label">Merchant</div>
                        <div class="info-value">${merchantName}</div>
                    </td>
                    <td valign="top" width="50%" style="padding-bottom: 20px;">
                        <div class="info-label">Return Window</div>
                        <div class="info-value">${returnWindowDays} Days</div>
                    </td>
                 </tr>
                 <tr>
                    <td valign="top" width="50%">
                        <div class="info-label">Status</div>
                        <div class="info-value">Verified & Unlocked</div>
                    </td>
                    <td valign="top" width="50%">
                        <div class="info-label">Date</div>
                        <div class="info-value">${new Date().toLocaleDateString("en-US", { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                    </td>
                 </tr>
               </table>
            </div>

          </div>

          <!-- Footer -->
          <div class="footer">
            <p style="margin: 0 0 10px 0;">Secured by ink. Verified Delivery Protocol</p>
            <p style="margin: 0;">&copy; ${new Date().getFullYear()} ink. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    try {
      await sendgrid.send({
        to,
        from: fromEmail,
        subject: `Your Order ${orderName} from ${merchantName} is Verified`,
        text: `Your delivery for order ${orderName} from ${merchantName} has been verified! Use this link to manage returns: ${returnButtonUrl}`, // Fallback plain text
        html: htmlContent,
      });

      console.log(`✅ Return Passport email sent to ${to}`);
      return true;
    } catch (error: any) {
      console.error("❌ Failed to send email:", error.response?.body || error.message);
      return false;
    }
  },

  /**
   * Legacy method - redirects to Return Passport email
   * Kept for backward compatibility
   */
  async sendVerificationEmail(payload: EmailPayload): Promise<boolean> {
    return this.sendReturnPassportEmail({
      ...payload,
      photoUrls: [],
      returnWindowDays: 30,
    });
  },
};
