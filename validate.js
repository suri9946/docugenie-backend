#!/usr/bin/env node

/**
 * DocuGenie Refactoring - Code Validation Script
 * Validates syntax of all modified files
 */

const fs = require('fs');
const path = require('path');

const filesToCheck = [
  'src/services/bookGenerationService.js',
  'src/services/upiPaymentService.js',
  'src/services/wordParsingService.js',
  'src/controllers/upiPaymentController.js',
  'src/routes/paymentRoutes.js',
  'src/services/supabaseService.js',
  'src/services/paymentService.js',
  'src/controllers/generateController.js',
];

console.log('🔍 DocuGenie Refactoring Validation\n');
console.log('Checking for syntax errors in modified files...\n');

let hasErrors = false;

filesToCheck.forEach((file) => {
  const filePath = path.join(__dirname, file);
  
  if (!fs.existsSync(filePath)) {
    console.log(`❌ File not found: ${file}`);
    hasErrors = true;
    return;
  }

  try {
    const code = fs.readFileSync(filePath, 'utf8');
    
    // Basic syntax check via require
    if (file.endsWith('.js')) {
      new Function(code); // Will throw if syntax error
      console.log(`✅ ${file}`);
    }
  } catch (error) {
    console.log(`❌ ${file}`);
    console.log(`   Error: ${error.message}\n`);
    hasErrors = true;
  }
});

console.log('\n' + '='.repeat(50));
console.log('Validation Summary:\n');

if (hasErrors) {
  console.log('❌ Syntax errors found! Please fix before deploying.\n');
  process.exit(1);
} else {
  console.log('✅ All files passed syntax validation!\n');
  
  console.log('Configuration Checklist:');
  console.log('[ ] GEMINI_API_KEY configured in .env');
  console.log('[ ] SUPABASE_URL configured in .env');
  console.log('[ ] SUPABASE_SERVICE_ROLE_KEY configured in .env');
  console.log('[ ] MERCHANT_UPI=7483353574@ibl in .env');
  console.log('[ ] Payment table created in Supabase');
  console.log('[ ] Frontend API URL configured');
  console.log('\n✨ Ready for testing!\n');
}
