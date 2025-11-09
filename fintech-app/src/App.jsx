// App.jsx: REVISED FOR ADVANCED NLU (INTENT/ENTITY) AND MOCK USER

import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, where, onSnapshot, addDoc, serverTimestamp, doc, getDoc, setDoc } from 'firebase/firestore'; 

import SetupFlow from './SetupFlow'; 

const FIREBASE_CONFIG = window.__firebase_config || {
    apiKey: "AIzaSyC0nfigPlac3h0ld3r", 
    authDomain: "fintech-app.firebaseapp.com",
    projectId: "fintech-app-demo",
    storageBucket: "fintech-app.appspot.com",
    messagingSenderId: "1234567890",
    appId: "1:1234567890:web:abcdef123456"
};
const APP_ID = window.__app_id || "fintech-app-demo";

const firebaseApp = initializeApp(FIREBASE_CONFIG, APP_ID);
const db = getFirestore(firebaseApp);

// 🎯 CRITICAL CHANGE: This now points to your secure Node.js backend proxy
const BACKEND_PROXY_ENDPOINT = "http://localhost:3001/api/process-chat"; 

const EXPENSE_CATEGORIES_FALLBACK = ['Groceries', 'Rent', 'Utilities', 'Transport', 'Entertainment', 'Salary', 'Other'];
const INVESTMENT_SYMBOLS = ['AAPL', 'MSFT', 'GOOGL', 'TSLA', 'SPY'];


const App = () => {
    // 🌟 MOCK USER REINSTATED
    const [user, setUser] = useState({ 
        uid: 'demo-user-123', 
        displayName: 'Demo User', 
        authToken: 'placeholder-token', 
    }); 

    const [isSetupComplete, setIsSetupComplete] = useState(false);
    const [userConfig, setUserConfig] = useState(null);
    
    const [isLoading, setIsLoading] = useState(true); // Keep loading true to fetch mock config
    const [isGeneratingAdvice, setIsGeneratingAdvice] = useState(false);

    // NOTE: These state variables are now for displaying historical data only
    const [expenses, setExpenses] = useState([]);
    const [investments, setInvestments] = useState([]);
    const [simulatedTransactions, setSimulatedTransactions] = useState([]); // 🌟 NEW: To log the double-entry results
    
    const [advice, setAdvice] = useState('Click "Get AI Analysis" to receive personalized financial insights based on your recorded data.');
    
    const [chatInput, setChatInput] = useState('');
    const [chatHistory, setChatHistory] = useState([{ type: 'system', message: 'Welcome to FinansManager! The NLU system is now running on the Advanced Intent/Entity model.' }]);


    const fetchSetupStatus = async () => {
        if (!user) {
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        try {
            const userProfileRef = doc(db, "user_profiles", user.uid);
            const docSnap = await getDoc(userProfileRef);

            if (docSnap.exists()) {
                const config = docSnap.data();
                setUserConfig(config);
                setIsSetupComplete(true);
                setUser(prev => ({ ...prev, displayName: config.name }));
            } else {
                setIsSetupComplete(false);
            }
        } catch (error) {
            console.error("Error fetching setup status:", error);
            setIsSetupComplete(false); 
        } finally {
            setIsLoading(false);
        }
    };

    const handleSetupComplete = (newName) => {
        setUser(prev => ({ ...prev, displayName: newName })); 
        fetchSetupStatus();
    };

    useEffect(() => {
        fetchSetupStatus();
    }, [user.uid]); 

    // 🎯 REVISED: fetchFinancialData to also track simulated transactions
    const fetchFinancialData = () => {
    if (!user || !isSetupComplete) return () => {}; 

        // Old collections (kept for historical view, but not used for new logging)
        const qExpenses = query(collection(db, "expenses"), where("userId", "==", user.uid));
        const unsubscribeExpenses = onSnapshot(qExpenses, (querySnapshot) => {
          const fetchedExpenses = querySnapshot.docs.map(doc => ({
            id: doc.id, ...doc.data(), amount: doc.data().amount ? parseFloat(doc.data().amount) : 0, 
          }));
          setExpenses(fetchedExpenses);
        });
        
        const qInvestments = query(collection(db, "investments"), where("userId", "==", user.uid));
        const unsubscribeInvestments = onSnapshot(qInvestments, (querySnapshot) => {
          const fetchedInvestments = querySnapshot.docs.map(doc => ({
            id: doc.id, ...doc.data(), shares: doc.data().shares ? parseFloat(doc.data().shares) : 0, 
            purchasePrice: doc.data().purchasePrice ? parseFloat(doc.data().purchasePrice) : 0, 
          }));
          setInvestments(fetchedInvestments);
        });

        // 🌟 NEW: Track simulated double-entry transactions
        const qSimulated = query(collection(db, "transactions_simulated"), where("userId", "==", user.uid));
        const unsubscribeSimulated = onSnapshot(qSimulated, (querySnapshot) => {
          const fetchedSimulated = querySnapshot.docs.map(doc => ({
            id: doc.id, ...doc.data()
          }));
          setSimulatedTransactions(fetchedSimulated);
        });

        return () => {
          unsubscribeExpenses();
          unsubscribeInvestments(); 
          unsubscribeSimulated(); // Cleanup
        };
    };
    
    useEffect(() => {
        if (user && isSetupComplete) {
          const cleanup = fetchFinancialData();
          return cleanup;
        }
        return () => {};
    }, [user, isSetupComplete]);

    // ----------------------------------------------------------------------
    // 🎯 NEW: processChatTransaction using Intent/Entity Model
    // ----------------------------------------------------------------------
    const processChatTransaction = async (e) => {
        e.preventDefault();
        // Ensure user config is loaded before processing
        if (!chatInput.trim() || !userConfig) return; 

        const userMessage = chatInput.trim();
        setChatInput(''); 
        
        setChatHistory(prev => [...prev, { type: 'user', message: userMessage, id: Date.now() }]);
        setIsLoading(true);

        // Configuration details for the prompt
        const categories = userConfig.categories?.join(', ') || EXPENSE_CATEGORIES_FALLBACK.join(', ');
        // Include 'Brokerage' as a potential investment account
        const accounts = userConfig.banks?.map(b => b.name).join(', ') + ', Brokerage' || 'Checking, Credit Card, Brokerage'; 
        const currency = userConfig.currency || 'USD';
        
        // 🌟 ADVANCED NLU SYSTEM INSTRUCTION based on blueprint
        const systemInstruction = `You are an expert financial NLU service. Based on the conversation history and the latest user message, determine the user's INTENT and extract all relevant ENTITIES.

    Your FINAL output MUST be a single JSON object. DO NOT include any explanatory text outside the JSON block.

    USER's CONTEXT:
    - Allowed Ledger/CATEGORIES: ${categories}
    - Allowed ACCOUNTS: ${accounts}
    - Default CURRENCY: ${currency}
    - Investment SYMBOLS: ${INVESTMENT_SYMBOLS.join(', ')}

    JSON SCHEMA:
    The output MUST match the following structure. Pay attention to the required fields for LOG_TRANSACTION.
    {
      "intent": "LOG_TRANSACTION" | "QUERY_DATA" | "EDIT_TRANSACTION" | "UNKNOWN",
      "entities": {
        "ACTION": "EXPENSE" | "INCOME" | "TRANSFER" | "BUY_STOCK" | "SELL_STOCK", // Required for LOG_TRANSACTION
        "AMOUNT": number, // Monetary value. Required for all LOG_TRANSACTION actions.
        "CURRENCY": string, // e.g., "USD"
        "DATE": string, // ISO 8601 format (YYYY-MM-DD). Use today's date if not specified.
        "DESCRIPTION": string,
        "SOURCE_ACCOUNT": string, // Required for Expense, Transfer, Buy.
        "DESTINATION_ACCOUNT": string, // Required for Income, Transfer, Sell.
        "CATEGORY": string, // Required for Expense, Income.
        "SYMBOL": string, // Required for Buy/Sell.
        "SHARES": number, // Required for Buy/Sell.
        "MISSING_FIELDS": string[] // CRITICAL: List all required fields (e.g., ACTION, AMOUNT, SOURCE_ACCOUNT, CATEGORY/SYMBOL) that could NOT be extracted. If all are present, this array MUST be empty.
      }
    }
    
    Prioritize extraction for the LOG_TRANSACTION intent.
    Latest User Input: "${userMessage}"`;

        let tempMessageId = Date.now() + 1;
        setChatHistory(prev => [...prev, { type: 'system', message: '...Running Advanced NLU...', id: tempMessageId }]);

        try {
            const response = await fetch(BACKEND_PROXY_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    userId: user.uid, 
                    systemInstruction: systemInstruction,
                    userMessage: userMessage,
                }), 
            });

            if (!response.ok) throw new Error(`Backend Proxy failed with status ${response.status}.`);

            const apiResult = await response.json();
            if (apiResult.status === 'error') {
                throw new Error(apiResult.message);
            }
            
            const nluResult = apiResult.parsedData;
            
            let finalMessage = '';
            let newChatType = 'ai'; 
            const entities = nluResult.entities || {};

            // 1. Ambiguity Resolution (Blueprint logic)
            if (nluResult.intent === 'LOG_TRANSACTION' && entities.MISSING_FIELDS?.length > 0) {
                
                const missing = entities.MISSING_FIELDS.join(', ');
                const firstMissing = entities.MISSING_FIELDS[0];
                
                // Generate a tailored clarification question
                let question;
                if (firstMissing === 'AMOUNT') {
                    question = `I'm ready to log this, but how much was the transaction?`;
                } else if (firstMissing === 'SOURCE_ACCOUNT' || firstMissing === 'DESTINATION_ACCOUNT') {
                    question = `Which account should I use? (e.g., ${accounts})`;
                } else if (firstMissing === 'CATEGORY') {
                    question = `Which ledger category does this fall under? (e.g., ${categories})`;
                } else if (firstMissing === 'SYMBOL') {
                    question = `What is the stock ticker (e.g., MSFT)?`;
                } else {
                    question = `I'm missing: **${missing}**. Please provide the details to proceed.`;
                }
                
                finalMessage = `💬 **Follow Up:** ${question} (Missing: ${missing})`;
                newChatType = 'ai'; 

            } else if (nluResult.intent === 'LOG_TRANSACTION' && entities.MISSING_FIELDS?.length === 0) {
                
                // 2. All info is present, simulate double-entry posting
                const action = entities.ACTION.toUpperCase();
                
                // Log to the simulated transactions collection
                await addDoc(collection(db, "transactions_simulated"), { 
                    userId: user.uid,
                    createdAt: serverTimestamp(),
                    ...entities // Log all entities to show success
                });
                
                let logDetails = '';
                if (action === 'EXPENSE' || action === 'INCOME') {
                    logDetails = `Category: ${entities.CATEGORY || 'N/A'}, Account: ${entities.SOURCE_ACCOUNT || entities.DESTINATION_ACCOUNT || 'N/A'}`;
                } else if (action === 'BUY_STOCK' || action === 'SELL_STOCK') {
                    logDetails = `${entities.SHARES} shares of **${entities.SYMBOL}** @ ${entities.AMOUNT.toFixed(2)}`;
                } else if (action === 'TRANSFER') {
                    logDetails = `From: ${entities.SOURCE_ACCOUNT} to ${entities.DESTINATION_ACCOUNT}`;
                }

                finalMessage = `✅ Logged **${action}** of **${entities.CURRENCY} ${entities.AMOUNT.toFixed(2)}** using the new double-entry schema. ${logDetails}`;
                newChatType = 'success';

            } else if (nluResult.intent === 'QUERY_DATA') {
                finalMessage = `🔍 **Data Query Intent:** I recognize you want to query data. The system is ready to process your query on a future iteration.`;
                newChatType = 'ai';
            } else {
                // UNKNOWN or UNHANDLED INTENT
                finalMessage = `❓ **Unknown Intent:** I couldn't process that request. The AI returned an unhandled intent: ${nluResult.intent}.`;
                newChatType = 'error';
            }
            
            // 5. Update Chat History
            setChatHistory(prev => {
                // Find and replace the '...Analyzing' message with the final result
                return prev.map(msg => msg.id === tempMessageId ? { ...msg, type: newChatType, message: finalMessage } : msg);
            });

        } catch (error) {
            console.error("Error processing transaction:", error);
            // Replace loading message with error
            setChatHistory(prev => prev.map(msg => msg.id === tempMessageId ? { ...msg, type: 'error', message: `❌ System Error: ${error.message}` } : msg));
        } finally {
            setIsLoading(false);
        }
    };
    // ----------------------------------------------------------------------
    // END OF REVISED LOGIC
    // ----------------------------------------------------------------------


    const generateAdvice = async () => {
        if (isGeneratingAdvice) return;
        
        setIsGeneratingAdvice(true);
        setAdvice("Analyzing data with Gemini AI... please wait.");

        const dataForAI = JSON.stringify({
            expenses: expenses.map(e => ({ amount: e.amount, category: e.category, description: e.description })),
            investments: investments.map(i => ({ symbol: i.symbol, shares: i.shares, price: i.purchasePrice })),
            simulated_transactions: simulatedTransactions, // Pass the new data structure
            profile: {
                currency: userConfig?.currency || 'USD',
                banks: userConfig?.banks.map(b => b.name),
                categories: userConfig?.categories,
            }
        }, null, 2);

        const prompt = `Analyze the following user's financial data and profile (${userConfig?.purpose || 'Personal'} budget in ${userConfig?.currency || 'USD'}) and provide a concise summary (1-2 paragraphs) followed by three actionable pieces of advice.
        
        [Financial Data]
        ${dataForAI}
        
        [Instructions]
        1. Summarize the user's spending habits (categorize major expenses).
        2. Comment on the diversity and total investment value.
        3. Provide three specific, numbered, and actionable financial tips based on the data.
        4. Mention the user's primary currency: ${userConfig?.currency || 'USD'}.`;
        
        // --- Mocking the AI Call with a 3-second delay (This part is still client-side mock) ---
        await new Promise(resolve => setTimeout(resolve, 3000)); 

        const totalInvestmentValue = investments.reduce((acc, inv) => 
            acc + (inv.shares * inv.purchasePrice)
        , 0).toFixed(2);
        const totalExpenses = expenses.reduce((acc, exp) => acc + (exp.amount || 0), 0).toFixed(2);
        const currency = userConfig?.currency || 'USD';
        
        let simulatedResponse = `
### 🧠 Gemini Financial Analysis

**Summary:**
This analysis is based on your **${userConfig?.purpose || 'Personal'}** budget tracking in **${currency}**. You have **${expenses.length}** transactions, totaling **${currency}$${totalExpenses}** in expenses (from old system) and **${simulatedTransactions.length}** transactions logged in the new NLU system. Your investment portfolio has **${investments.length}** holdings with an initial value of **${currency}$${totalInvestmentValue}**. Your largest expense categories appear to be Rent and Groceries.

**Actionable Advice:**
1. **Budget Review:** Utilize your tracking by setting a hard budget limit for **Entertainment** (or your highest non-essential category) to free up **${currency}$100-200** monthly for savings.
2. **Diversify Investments:** To mitigate risk, consider allocating a portion of future investment capital into a broader index ETF (like a total market fund) to reduce reliance on individual tech stocks.
3. **Emergency Fund:** If you don't already have one, prioritize saving **3-6 months** of expenses into a high-yield savings account before increasing your investment contributions further.
`;

        setAdvice(simulatedResponse);
        setIsGeneratingAdvice(false);
    };


    const totalInvestmentValue = investments.reduce((acc, inv) => 
        acc + (inv.shares * inv.purchasePrice)
    , 0).toFixed(2);

    if (isLoading) {
        return (
          <div className="flex justify-center items-center min-h-screen bg-gray-900 text-white">
            Checking application status...
          </div>
        );
    }
    
    // --- Fix App.jsx rendering logic ---
    if (!isSetupComplete) {
        return <SetupFlow 
            user={user} 
            onSetupComplete={handleSetupComplete} 
            initialConfig={userConfig || {}}
            db={db}
            doc={doc}
            setDoc={setDoc}
        />;
    }
// ------------------------------------

    return (
      <div className="min-h-screen bg-gray-900 text-white p-4 sm:p-8">
        <header className="flex justify-between items-center pb-6 border-b border-gray-700">
          <h1 className="text-3xl font-bold text-teal-400">FinTech Tracker Pro (Web App)</h1>
          <div className="text-sm">Welcome back, <span className="font-semibold">{user.displayName}</span> | Currency: {userConfig?.currency || 'USD'}</div>
        </header>
        
        <main className="grid grid-cols-1 lg:grid-cols-3 gap-8 pt-8">

            <section className="lg:col-span-3 bg-gray-800 p-6 rounded-lg shadow-xl mb-4">
                <h2 className="text-2xl font-semibold mb-4 text-orange-300">Financial Performance Overview</h2>
                <div className="grid grid-cols-3 gap-4 text-center">
                    <div className="bg-gray-700 p-4 rounded-lg">
                        <h4 className="text-sm text-gray-400">Today's Status</h4>
                        <p className="text-2xl font-bold text-green-400">N/A</p>
                    </div>
                    <div className="bg-gray-700 p-4 rounded-lg">
                        <h4 className="text-sm text-gray-400">Last Week Performance</h4>
                        <p className="text-2xl font-bold text-yellow-400">N/A</p>
                    </div>
                    <div className="bg-gray-700 p-4 rounded-lg">
                        <h4 className="text-sm text-gray-400">Monthly Performance</h4>
                        <p className="text-2xl font-bold text-red-400">N/A</p>
                    </div>
                </div>
                <p className="text-sm text-gray-400 mt-2">Note: Advanced calculations (Today/Week/Month) will be developed in the next step.</p>
            </section>
            
            <section className="lg:col-span-3 bg-gray-800 p-6 rounded-lg shadow-xl order-first">
              <h2 className="text-2xl font-semibold mb-4 text-purple-300">Transaction Chat (NLP)</h2>
                <div className="h-64 overflow-y-auto p-4 bg-gray-900 rounded-lg mb-4 space-y-3">
                    {chatHistory.map((chat, index) => (
                        <div 
                            key={index} 
                            // 🌟 UPDATED: Chat rendering for specific color coding
                            className={`p-2 rounded-lg max-w-lg ${
                                chat.type === 'user' ? 'bg-purple-600 ml-auto text-right' : 
                                chat.type === 'success' ? 'bg-green-700 text-left' : 
                                chat.type === 'ai' ? 'bg-teal-700 text-left' : // Follow-up/Query
                                chat.type === 'error' ? 'bg-red-700 text-left' : 
                                'bg-gray-700 text-left' // System/Loading
                            }`}
                        >
                            <span className="font-semibold capitalize text-sm">{chat.type === 'user' ? 'You' : 'System'}: </span>{chat.message}
                        </div>
                    ))}
                </div>
              <form onSubmit={processChatTransaction} className="flex space-x-2">
                
                <input
                    type="text"
                    placeholder={`Type your transaction, e.g., 'Spent ${userConfig?.currency || 'USD'}$50 for Groceries from Checking'`}
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    className="flex-grow p-3 rounded-lg bg-gray-700 border border-gray-600 focus:ring-purple-400 focus:border-purple-400 text-white"
                    disabled={isLoading}
                />
                
                <button
                    type="submit"
                    className={`px-6 py-3 font-bold rounded-lg transition duration-200 shadow-md ${isLoading ? 'bg-gray-500 cursor-not-allowed' : 'bg-purple-600 hover:bg-purple-700'}`}
                    disabled={isLoading}
                >
                    {isLoading ? 'Sending...' : 'Send'}
                </button>
              </form>
            </section>
            
            {/* 🎯 NEW: DISPLAY SIMULATED TRANSACTIONS */}
            <section className="lg:col-span-2 bg-gray-800 p-6 rounded-lg shadow-xl">
              <h2 className="text-2xl font-semibold mb-4 text-teal-300">Simulated Ledger Entries ({simulatedTransactions.length})</h2>
              <p className="text-sm text-gray-400 mb-4">
                  These transactions were logged using the **new NLU Intent/Entity Model**.
              </p>

              <h3 className="text-xl font-medium mb-2 border-b border-gray-600 pb-1">Recent Transactions</h3>
              <ul className="mt-4 space-y-3 max-h-64 overflow-y-auto pr-2">
                 {simulatedTransactions.length === 0 ? (
                    <li className="text-gray-500 p-3 bg-gray-700 rounded-md">No simulated transactions yet.</li>
                 ) : (
                    simulatedTransactions.map(tx => (
                        <li key={tx.id} className="flex justify-between items-center p-3 bg-gray-700 hover:bg-gray-600 rounded-lg transition duration-150">
                            <div className="flex flex-col">
                                <span className="text-xs font-mono text-yellow-400">{tx.entities?.ACTION}</span>
                                <span className="font-medium text-white">{tx.entities?.DESCRIPTION || 'No description'}</span>
                                <span className="text-sm text-teal-300">
                                    {tx.entities?.CATEGORY || tx.entities?.SYMBOL} ({tx.entities?.SOURCE_ACCOUNT || tx.entities?.DESTINATION_ACCOUNT})
                                </span>
                            </div>
                            <span className="text-red-400 font-bold text-lg">
                                {tx.entities?.CURRENCY || userConfig?.currency || 'USD'} ${tx.entities?.AMOUNT?.toFixed(2) || '0.00'}
                            </span>
                        </li>
                    ))
                )}
              </ul>
            </section>


            <section className="bg-gray-800 p-6 rounded-lg shadow-xl">
              <h2 className="text-2xl font-semibold mb-4 text-teal-300">Investment Portfolio (Old System)</h2>
              <div className="text-gray-400 mb-4">
                Initial Investment Value: <span className="text-green-400 font-bold text-xl">
                        {userConfig?.currency || 'USD'}${totalInvestmentValue}
                    </span>
              </div>

              <h3 className="text-xl font-medium mb-2 border-b border-gray-600 pb-1">Current Holdings ({investments.length})</h3>
              <ul className="mt-4 space-y-3 max-h-64 overflow-y-auto pr-2">
                 {investments.length === 0 ? (
                    <li className="text-gray-500 p-3 bg-gray-700 rounded-md">No investments recorded. Use the Chat above!</li>
                 ) : (
                    investments.map(inv => (
                        <li key={inv.id} className="flex justify-between items-center p-3 bg-gray-700 hover:bg-gray-600 rounded-lg transition duration-150">
                            <div className="flex flex-col">
                                <span className="font-medium text-white">{inv.symbol} ({inv.shares} shares)</span>
                                <span className="text-sm text-green-300">Avg. Price: {userConfig?.currency || 'USD'}${inv.purchasePrice.toFixed(2)}</span>
                            </div>
                            <span className="text-green-400 font-bold text-lg">
                               {userConfig?.currency || 'USD'}${(inv.shares * inv.purchasePrice).toFixed(2)}
                            </span>
                        </li>
                    ))
                )}
              </ul>
            </section>


            <section className="lg:col-span-3 bg-gray-800 p-6 rounded-lg shadow-xl mt-4">
              <h2 className="text-2xl font-semibold mb-4 text-teal-300">AI Financial Advisor</h2>
              <button 
                onClick={generateAdvice}
                className={`px-4 py-2 text-white font-bold rounded-lg transition duration-200 ${isGeneratingAdvice ? 'bg-purple-800 cursor-not-allowed' : 'bg-purple-600 hover:bg-purple-700'}`}
                  disabled={isGeneratingAdvice}
              >
                {isGeneratingAdvice ? 'Analyzing...' : 'Get AI Analysis'}
              </button>
              <p className="mt-4 p-4 bg-gray-700 rounded-md whitespace-pre-wrap">{advice}</p>
            </section>
        </main>
      </div>
    );
};

export default App;