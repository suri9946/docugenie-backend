const { GoogleGenAI } = require("@google/genai");

let geminiClient = null;

if (process.env.GEMINI_API_KEY) {
  geminiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

const getGeminiClient = () => geminiClient;

module.exports = {
  getGeminiClient,
};

