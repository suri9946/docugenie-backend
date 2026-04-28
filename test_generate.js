require('dotenv').config();
const { generateUPIPaymentRequest } = require('./src/controllers/upiPaymentController');

const req = { body: { documentId: 'ref-123', provider: 'generic' } };
const res = {
    status: (code) => {
        console.log('Status:', code);
        return {
            json: (data) => console.log('JSON:', JSON.stringify(data, null, 2))
        };
    }
};
const next = (err) => console.log('Next error:', err.stack);

generateUPIPaymentRequest(req, res, next).catch(e => console.error('Caught:', e));
