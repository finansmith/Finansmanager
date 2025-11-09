// C:\Users\Elson\fintech-app-backend\server.js - IMPROVED FOR MULTI-TURN CHAT

const express = require('express');
const { GoogleGenAI } = require('@google/genai');
require('dotenv').config(); 

// --- Configuration ---
const port = 3001;
const REACT_APP_URL = "http://localhost:5173"; // Ensure this matches your Vite port

// Initialize Gemini AI Client
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }); 
const app = express();

// A simple in-memory store for chat sessions. 
// In a production app, this would be in a database (e.g., Redis).
const chatSessions = {}; 

// Middleware setup
app.use(express.json());

// CORS: Allows your React frontend to communicate with this backend
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", REACT_APP_URL);
    res.header("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    next();
});

// 🎯 SECURE API PROXY ENDPOINT
app.post('/api/process-chat', async (req, res) => {
    // We now receive the entire chat history and the current user message
    const { userId, systemInstruction, userMessage } = req.body;
    
    if (!userId || !systemInstruction || !userMessage) {
        return res.status(400).json({ error: "Missing required fields (userId, systemInstruction, or userMessage)." });
    }

    // 1. Get or Create the Chat Session for this User
    if (!chatSessions[userId]) {
        // Create a new chat session, passing the crucial system instruction
        chatSessions[userId] = ai.chats.create({
            model: 'gemini-2.5-flash',
            config: {
                systemInstruction: systemInstruction,
                responseMimeType: "application/json", 
            }
        });
        console.log(`[${userId}] New chat session created.`);
    }

    const chat = chatSessions[userId];

    try {
        // 2. Send the new message to the existing chat session
        const response = await chat.sendMessage({ message: userMessage });
        
        const rawJsonString = response.text.trim();
        let jsonResponse;

        // 3. Robust JSON Parsing
        try {
            jsonResponse = JSON.parse(rawJsonString);
        } catch (e) {
            console.error("JSON PARSING FAILED: AI returned malformed text.", e.message);

            // Send custom clarification/error back to the frontend
            return res.json({
                status: 'error',
                parsedData: {
                    type: 'clarification',
                    issue: `I couldn't process that. The AI's response was malformed. Please try rephrasing your message.`,
                }
            });
        }
        
        // 4. Success: Send the structured data back to the frontend
        res.json({
            status: 'success',
            parsedData: jsonResponse 
        });

    } catch (error) {
        // Handles network errors, API key errors, or other SDK failures
        console.error("Gemini API Error:", error.message);
        
        res.status(500).json({ 
            status: 'error', 
            message: 'Failed to process chat via AI. Check backend logs for detail.',
            detail: error.message
        });
    }
});

// --- Start the Server ---
app.listen(port, () => {
    console.log(`✅ Backend proxy running securely at http://localhost:${port}`);
    console.log(`   Waiting for calls from: ${REACT_APP_URL}`);
});