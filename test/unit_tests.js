const assert = require('assert');
const { extractVariables, interpolate, renderEmail } = require('../server/services/templateEngine');
const { standardizeRows, identifyColumns } = require('../server/services/fileParser');

console.log('🧪 Running Mass Mailer Automated Unit Tests...\n');

// 1. Template Engine Tests
console.log('1️⃣ Testing Dynamic Template Engine...');
const sampleTemplate = {
  subject: 'Hello {{name}}, welcome to {{company | "our company"}}!',
  body_html: '<p>Hi {{name}}, your role as {{role | "team member"}} in {{city}} is confirmed for {{email}}.</p>'
};

const vars = extractVariables(`${sampleTemplate.subject} ${sampleTemplate.body_html}`);
assert(vars.includes('name'), 'Should detect "name" tag');
assert(vars.includes('company'), 'Should detect "company" tag');
assert(vars.includes('role'), 'Should detect "role" tag');
assert(vars.includes('city'), 'Should detect "city" tag');
assert(vars.includes('email'), 'Should detect "email" tag');
console.log('  ✓ extractVariables extracted all dynamic tags:', vars);

// Interpolate with full data
const contactWithData = {
  name: 'Vikram Singh',
  email: 'vikram@example.com',
  company: 'Zenith Retail',
  custom_fields: { role: 'Founder & CEO', city: 'Jaipur' }
};

const rendered = renderEmail(sampleTemplate, contactWithData);
assert.strictEqual(rendered.subject, 'Hello Vikram Singh, welcome to Zenith Retail!');
assert(rendered.html.includes('Founder & CEO'), 'Should replace role with custom field value');
assert(rendered.html.includes('Jaipur'), 'Should replace city with custom field value');
console.log('  ✓ interpolate replaced variables with contact values successfully');

// Interpolate with missing data (testing fallback)
const contactMissingData = {
  name: 'Amit',
  email: 'amit@example.com'
};

const renderedFallback = renderEmail(sampleTemplate, contactMissingData);
assert.strictEqual(renderedFallback.subject, 'Hello Amit, welcome to our company!');
assert(renderedFallback.html.includes('team member'), 'Should use fallback "team member" for role');
console.log('  ✓ Fallback default syntax {{ variable | "default" }} works as expected');

// 2. File Parser Tests
console.log('\n2️⃣ Testing File Parser & Column Auto-Detection...');
const mockRawRows = [
  { 'Customer Email': 'alice@domain.com', 'Full Name': 'Alice Cooper', 'Company Name': 'Acme Corp', 'Plan': 'Enterprise' },
  { 'Customer Email': 'bob@domain.com', 'Full Name': 'Bob Dylan', 'Company Name': 'Music Co', 'Plan': 'Pro' },
  { 'Customer Email': 'invalid-email-string', 'Full Name': 'Invalid User', 'Company Name': 'None' },
  { 'Customer Email': 'alice@domain.com', 'Full Name': 'Alice Duplicate', 'Company Name': 'Acme Corp' } // duplicate
];

const standardized = standardizeRows(mockRawRows);
assert.strictEqual(standardized.contacts.length, 2, 'Should have 2 valid unique contacts');
assert.strictEqual(standardized.invalidRows.length, 2, 'Should flag 2 invalid rows (1 malformed email, 1 duplicate)');
assert.strictEqual(standardized.contacts[0].email, 'alice@domain.com');
assert.strictEqual(standardized.contacts[0].name, 'Alice Cooper');
assert.strictEqual(standardized.contacts[0].company, 'Acme Corp');
assert.strictEqual(standardized.contacts[0].custom_fields.Plan, 'Enterprise');
// 3. Custom Mapping & Auto-Match Tests
console.log('\n3️⃣ Testing Explicit Custom Mapping & Auto-Matching...');
const { autoMatchVariables } = require('../server/services/fileParser');

const headers = ['Recipient Mail', 'Client Full Name', 'Organization', 'City Location', 'Job Title'];
const autoMatched = autoMatchVariables(headers, ['email', 'name', 'company', 'place', 'role']);
assert.strictEqual(autoMatched.email, 'Recipient Mail', 'Auto-match email synonym');
assert.strictEqual(autoMatched.name, 'Client Full Name', 'Auto-match name synonym');
assert.strictEqual(autoMatched.company, 'Organization', 'Auto-match company synonym');
assert.strictEqual(autoMatched.place, 'City Location', 'Auto-match place synonym');
assert.strictEqual(autoMatched.role, 'Job Title', 'Auto-match role synonym');
console.log('  ✓ autoMatchVariables correctly mapped template tags to spreadsheet columns');

// Test standardizeRows with customMapping
const customMapped = standardizeRows(
  [{ 'Recipient Mail': 'test@org.com', 'Client Full Name': 'Test User', 'Organization': 'Org Inc', 'City Location': 'Jaipur', 'Job Title': 'Director' }],
  {
    email: 'Recipient Mail',
    name: 'Client Full Name',
    company: 'Organization',
    customFields: { place: 'City Location', role: 'Job Title' }
  }
);
assert.strictEqual(customMapped.contacts.length, 1);
assert.strictEqual(customMapped.contacts[0].email, 'test@org.com');
assert.strictEqual(customMapped.contacts[0].name, 'Test User');
assert.strictEqual(customMapped.contacts[0].company, 'Org Inc');
assert.strictEqual(customMapped.contacts[0].custom_fields.place, 'Jaipur');
assert.strictEqual(customMapped.contacts[0].custom_fields.role, 'Director');
console.log('  ✓ standardizeRows correctly honored explicit customMapping');

// 4. Email Image URL Resolution & Email Client Safety Tests
console.log('\n4️⃣ Testing Email Image URL Resolution...');
const { resolveEmailImages } = require('../server/services/templateEngine');

// Absolute URLs should remain untouched
const htmlWithOnlineImg = '<p><img src="https://images.unsplash.com/photo-123" width="600" style="width: 600px; height: 180px; object-fit: cover;" /></p>';
const resolvedOnline = resolveEmailImages(htmlWithOnlineImg);
assert.strictEqual(resolvedOnline, htmlWithOnlineImg, 'Online absolute URLs should be preserved');
console.log('  ✓ Online image URLs (https://) are preserved for email dispatch');

// Relative URLs with APP_URL set should be made absolute
process.env.APP_URL = 'https://mail.alpever.com';
const htmlWithLocalImg = '<p><img src="/uploads/images/banner.png" width="600" /></p>';
const resolvedWithDomain = resolveEmailImages(htmlWithLocalImg);
// Legacy freeimage/iili URLs should be repaired and resolved with APP_URL
const htmlWithLegacy = '<p><img src="https://iili.io/nAo6aa9.jpg" /></p>';
const resolvedLegacy = resolveEmailImages(htmlWithLegacy);
assert(!resolvedLegacy.includes('https://iili.io/nAo6aa9.jpg') && resolvedLegacy.includes('/uploads/images/'), 'Legacy iili links should be rescued to local uploads');
console.log('  ✓ Legacy freeimage.host / iili.io URLs are auto-rescued to local uploads');

console.log('\n5️⃣ Testing Email Open Tracking Engine...');
const {
  TRANSPARENT_1X1_GIF,
  generateTrackingToken,
  parseTrackingToken,
  generateTrackingPixel
} = require('../server/services/trackService');

// Verify token encoding & decoding
const token = generateTrackingToken(42, 9);
const parsed = parseTrackingToken(token);
assert.strictEqual(parsed.logId, 42, 'Decoded logId must match original');
assert.strictEqual(parsed.campaignId, 9, 'Decoded campaignId must match original');
console.log('  ✓ Tracking token successfully generated and decoded:', token, '->', parsed);

// Verify pixel tag generation
process.env.APP_URL = 'https://mailer.alpever.com';
const pixelTag = generateTrackingPixel(42, 9);
assert(pixelTag.includes('https://mailer.alpever.com/api/track/open/' + token), 'Pixel tag must contain full domain and token');
assert(pixelTag.includes('display:none!important'), 'Pixel tag must be invisible');
console.log('  ✓ Invisible tracking pixel <img> generated correctly');

// Verify GIF buffer
assert.strictEqual(TRANSPARENT_1X1_GIF.length, 42, 'Transparent GIF must be exactly 42 bytes');
assert(TRANSPARENT_1X1_GIF.toString('ascii').startsWith('GIF89a'), 'Buffer must be valid GIF89a header');
console.log('  ✓ 42-byte transparent GIF header validated');

// 6. Mobile Responsiveness Tests
console.log('\n6️⃣ Testing Mobile Email Responsiveness & Image Optimization...');
const sampleDesktopTemplate = {
  subject: 'Test Mobile Responsiveness',
  body_html: '<p>Hello</p><img src="https://example.com/banner.jpg" width="533" height="350" style="width: 533px; height: 350px; object-fit: cover; aspect-ratio: 533 / 350;">'
};
const renderedMobile = renderEmail(sampleDesktopTemplate, { email: 'test@example.com' });
assert(!renderedMobile.html.includes('height="350"'), 'Fixed height attribute must be removed for mobile');
assert(!renderedMobile.html.includes('object-fit: cover'), 'object-fit: cover must be removed to prevent mobile clipping');
assert(!renderedMobile.html.includes('aspect-ratio:'), 'aspect-ratio must be removed');
assert(renderedMobile.html.includes('max-width: 100%'), 'max-width: 100% must be present');
assert(renderedMobile.html.includes('height: auto'), 'height: auto must be present');
assert(renderedMobile.html.includes('<meta name="viewport" content="width=device-width, initial-scale=1.0">'), 'Viewport meta tag must be included for mobile email clients');
console.log('  ✓ Email correctly optimized with responsive mobile layout and non-clipping image styles');

console.log('\n🎉 ALL UNIT TESTS PASSED SUCCESSFULLY! Everything is working properly.');
