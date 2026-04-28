require('dotenv').config();
const { supabase } = require('./src/config/supabase');

async function testFetch() {
    try {
        const { data, error } = await supabase.from('payments').select('id').limit(1);
        if (error) throw error;
        console.log('Success:', data);
    } catch (err) {
        console.log('Error message:', err.message);
        if (err.cause) {
            console.log('Error cause:', err.cause);
        }
    }
}

testFetch();
