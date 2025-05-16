# 🌐 WebIntel – Bulk Website Security & CDN Analyzer

WebIntel is a powerful and easy-to-use tool that allows users to **analyze multiple websites at once** for key infrastructure details, such as:

- ✅ CDN provider (e.g., Akamai, Cloudflare, Edgecast)
- 🛡️ Security features like WAF detection (via WaafW00f)
- 📁 Output results in a downloadable Excel report

---

## 🚀 Features

- 📥 Upload a spreadsheet (.xlsx/.xls) containing website URLs
- 🧠 Automatically detects the correct column for website inputs
- 🧩 Integrates with **IPInfo API** for accurate CDN detection
- 🔍 Uses **WaafW00f** to detect WAFs and security protections
- 🎨 Sleek UI built with React + Material UI
- 📄 Download detailed analysis in Excel format
- 🧪 Works without storing user data permanently

---

## 🖥️ Tech Stack

| Frontend       | Backend             | Security Detection |
|----------------|---------------------|---------------------|
| React + MUI    | Node.js + Express   | WaafW00f (Python)   |
| Axios          | xlsx                | IPInfo CDN API      |

---

## 📦 Installation

### 1. Clone the repository

```bash
git clone https://github.com/akshayk1204/WebIntel.git
cd WebIntel
