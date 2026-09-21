# AlpEver Mail - Smart Dynamic Mass Email Dispatcher

> A high-performance, dynamic bulk email dispatch platform with real-time WYSIWYG Template Studio, flexible Excel/CSV custom variable mapping, MySQL persistence, and Resend delivery engine.

![AlpEver Mail Logo](public/img/logo.png)

---

## 🚀 Key Features

- **WYSIWYG Email Studio & Live HTML Code Editor**:
  - Full rich text formatting (Headings, Paragraph, Bold, Italic, Underline, Alignments, Lists, CTA Buttons, Links, Dividers).
  - 0ms zero-latency real-time preview sync while typing.
  - Switch freely between Visual Studio mode and Clean HTML code mode.

- **Any Dynamic Excel/CSV Header Mapping**:
  - Automatically maps ANY spreadsheet column (`{{name}}`, `{{company}}`, `{{place}}`, `{{discount}}`, `{{role}}`, etc.) to contact data without extra coding.
  - Case-insensitive matching (`Place`, `place`, `PLACE`).
  - Fallback default syntax support: `{{place | "your city"}}` automatically inserts a fallback if an Excel cell is empty.

- **Audience & Contact Management**:
  - Drag-and-drop Excel (`.xlsx`, `.xls`) and `.csv` import.
  - Automatic duplicate email deduplication and format validation.
  - Full MySQL persistence with structured JSON `custom_fields`.

- **Reliable Dispatch & Queue Engine**:
  - Powered by Resend API.
  - Rate-limit aware batch dispatcher with sequential delay controls.
  - Real-time campaign tracking: Sent, Delivered, Queued, and Failed analytics.

- **Modern AlpEver White Theme UI**:
  - Clean, crisp white & orange `#f97316` brand palette.
  - Polished cards, intuitive sidebar navigation, and squircle stat badges.

---

## 🛠️ Tech Stack

- **Backend**: Node.js, Express.js
- **Database**: MySQL 8.0 (mysql2 with connection pooling)
- **Delivery**: Resend API (`resend` SDK)
- **File Parsing**: `xlsx`, `csv-parser`
- **Frontend**: Vanilla HTML5, Modern CSS3, Modular JavaScript

---

## 📦 Getting Started

### 1. Prerequisites
- Node.js (v18 or higher)
- MySQL Server 8.0 (running locally or remote)

### 2. Installation

Clone the repository:
```bash
git clone https://github.com/alpever/alpever-mail.git
cd alpever-mail
```

Install dependencies:
```bash
npm install
```

### 3. Environment Configuration

Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Configure your credentials in `.env`:
```env
PORT=3000

# MySQL Configuration
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=mass_mailer_db

# Resend API Key
RESEND_API_KEY=re_your_api_key_here
DEFAULT_FROM_NAME=AlpEver Mail
DEFAULT_FROM_EMAIL=onboarding@resend.dev
```

### 4. Database Setup & Initialization

Start your MySQL server, then initialize the database tables:
```bash
npm run db:init
```

### 5. Launch the Application

Start the development server:
```bash
npm start
```

Open your browser and navigate to:
```
http://localhost:3000
```

---

## 📁 Project Structure

```
alpever-mail/
├── public/
│   ├── css/               # Modular stylesheet system (layout, components, editor)
│   ├── img/               # AlpEver brand assets & logo
│   ├── js/                # Client-side views (dashboard, audience, templates, campaigns)
│   └── index.html         # Main single-page application interface
├── server/
│   ├── config/            # Database pool & configuration
│   ├── routes/            # REST API endpoints (contacts, templates, campaigns, stats)
│   └── services/          # File parser, template interpolation engine, queue dispatcher
├── scripts/               # DB reset and test utilities
├── uploads/               # Temporary file upload staging
├── .env.example           # Environment template
└── package.json           # Dependencies and run scripts
```

---

## 📄 License
MIT © AlpEver
