import React, { useState } from 'react';

const DEFAULT_CATEGORIES = ['Groceries', 'Rent', 'Utilities', 'Transport', 'Entertainment', 'Salary', 'Other'];
const DEFAULT_CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'JPY', 'INR'];


const SetupFlow = ({ user, onSetupComplete, initialConfig = {}, db, doc, setDoc }) => {
    const [step, setStep] = useState(1); 
    const [setupData, setSetupData] = useState({
        name: user?.displayName || '',
        place: initialConfig.place || '',
        currency: initialConfig.currency || DEFAULT_CURRENCIES[0],
        banks: initialConfig.banks || [{ name: 'Bank A', id: 1 }],
        purpose: initialConfig.purpose || 'Personal',
        categories: initialConfig.categories || DEFAULT_CATEGORIES,
    });
    const [isSaving, setIsSaving] = useState(false);
    const [setupError, setSetupError] = useState(null);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setSetupData(prev => ({ ...prev, [name]: value }));
    };

    const handleBankChange = (index, value) => {
        const newBanks = [...setupData.banks];
        newBanks[index].name = value;
        setSetupData(prev => ({ ...prev, banks: newBanks }));
    };

    const addBank = () => {
        setSetupData(prev => ({ 
            ...prev, 
            banks: [...prev.banks, { name: '', id: Date.now() }] 
        }));
    };

    const removeBank = (index) => {
        setSetupData(prev => ({ 
            ...prev, 
            banks: prev.banks.filter((_, i) => i !== index) 
        }));
    };

    const toggleCategory = (category) => {
        setSetupData(prev => ({
            ...prev,
            categories: prev.categories.includes(category) 
                ? prev.categories.filter(c => c !== category)
                : [...prev.categories, category]
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (step === 2) {
            setIsSaving(true);
            setSetupError(null);
            
            const cleanedData = {
                ...setupData,
                banks: setupData.banks.filter(bank => bank.name.trim() !== ''),
                categories: setupData.categories,
            };

            try {
                const userProfileRef = doc(db, "user_profiles", user.uid);
                await setDoc(userProfileRef, cleanedData, { merge: true });

                onSetupComplete(cleanedData.name); 

            } catch (error) {
                console.error("Error saving user setup:", error);
                setSetupError("Failed to save configuration. Please try again.");
                setIsSaving(false);
            }
        } else {
            setStep(step + 1);
        }
    };

    const renderStep1 = () => (
        <>
            <h3 className="text-xl font-semibold text-white mb-4">Step 1: Your Profile</h3>
            <div className="space-y-4">
                <input
                    type="text"
                    name="name"
                    placeholder="Your Name"
                    value={setupData.name}
                    onChange={handleChange}
                    required
                    className="w-full p-3 rounded-lg bg-gray-700 border border-gray-600 focus:ring-teal-400 focus:border-teal-400 text-white"
                />
                <input
                    type="text"
                    name="place"
                    placeholder="Place Residing (e.g., City, Country)"
                    value={setupData.place}
                    onChange={handleChange}
                    required
                    className="w-full p-3 rounded-lg bg-gray-700 border border-gray-600 focus:ring-teal-400 focus:border-teal-400 text-white"
                />
                <select
                    name="currency"
                    value={setupData.currency}
                    onChange={handleChange}
                    className="w-full p-3 rounded-lg bg-gray-700 border border-gray-600 focus:ring-teal-400 focus:border-teal-400 text-white appearance-none"
                >
                    {DEFAULT_CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <select
                    name="purpose"
                    value={setupData.purpose}
                    onChange={handleChange}
                    className="w-full p-3 rounded-lg bg-gray-700 border border-gray-600 focus:ring-teal-400 focus:border-teal-400 text-white appearance-none"
                >
                    <option value="Personal">Personal Finances</option>
                    <option value="Family">Family/Household Budget</option>
                    <option value="Business">Small Business Tracking</option>
                    <option value="Other">Other</option>
                </select>
            </div>
            <div className="flex justify-end mt-6">
                <button type="button" onClick={() => setStep(2)} className="py-2 px-6 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-lg transition duration-200">
                    Next: Banks & Categories
                </button>
            </div>
        </>
    );

    const renderStep2 = () => (
        <>
            <h3 className="text-xl font-semibold text-white mb-4">Step 2: Banks & Categories</h3>

            <h4 className="text-lg font-medium text-teal-300 mb-2">Your Banks</h4>
            <div className="space-y-3 p-3 bg-gray-700 rounded-lg">
                {setupData.banks.map((bank, index) => (
                    <div key={bank.id} className="flex space-x-2">
                        <input
                            type="text"
                            placeholder={`Bank/Account Name ${index + 1}`}
                            value={bank.name}
                            onChange={(e) => handleBankChange(index, e.target.value)}
                            className="flex-grow p-2 rounded-lg bg-gray-600 border border-gray-500 text-white"
                        />
                        <button type="button" onClick={() => removeBank(index)} className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded-lg text-white font-bold" disabled={setupData.banks.length === 1}>
                            -
                        </button>
                    </div>
                ))}
                <button type="button" onClick={addBank} className="w-full py-2 border border-dashed border-teal-400 text-teal-400 hover:bg-gray-600 rounded-lg transition duration-200">
                    + Add Another Bank
                </button>
            </div>

            <h4 className="text-lg font-medium text-teal-300 mt-6 mb-2">Expense Categories (Select to KEEP)</h4>
            <div className="flex flex-wrap gap-2 p-3 bg-gray-700 rounded-lg">
                {DEFAULT_CATEGORIES.map(category => (
                    <button
                        key={category}
                        type="button"
                        onClick={() => toggleCategory(category)}
                        className={`px-4 py-2 rounded-full font-semibold transition duration-150 ${
                            setupData.categories.includes(category) 
                                ? 'bg-green-600 text-white hover:bg-green-700' 
                                : 'bg-gray-500 text-gray-900 hover:bg-gray-400'
                        }`}
                    >
                        {setupData.categories.includes(category) ? '✅' : '❌'} {category}
                    </button>
                ))}
            </div>
            <p className="text-sm text-gray-400 mt-2">Deselect any categories you don't need for tracking.</p>

            <div className="flex justify-between mt-6">
                <button type="button" onClick={() => setStep(1)} className="py-2 px-6 bg-gray-600 hover:bg-gray-700 text-white font-bold rounded-lg transition duration-200">
                    Back
                </button>
                <button type="submit" disabled={isSaving || setupData.categories.length === 0} className="py-2 px-6 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-lg transition duration-200">
                    {isSaving ? 'Saving Configuration...' : 'Finish Setup'}
                </button>
            </div>
        </>
    );

    return (
        <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-4">
            <div className="w-full max-w-lg bg-gray-800 p-8 rounded-xl shadow-2xl">
                <h2 className="text-3xl font-bold text-teal-400 mb-6 border-b border-gray-700 pb-3">
                    FinansManager Setup Wizard 🚀 <span className="text-lg text-gray-400">({step}/2)</span>
                </h2>
                
                {setupError && <p className="p-3 mb-4 bg-red-800 text-white rounded-lg">{setupError}</p>}
                
                <form onSubmit={handleSubmit}>
                    {step === 1 && renderStep1()}
                    {step === 2 && renderStep2()}
                </form>
            </div>
        </div>
    );
};

export default SetupFlow;