import { useState, type FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Info } from "lucide-react";
import { useThemeSync } from "../../util/misc/useThemeSync";

export default function Signup() {
    const navigate = useNavigate();
    const { isLight } = useThemeSync();

    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [onshapeAccessKey, setOnshapeAccessKey] = useState("");
    const [onshapeSecretKey, setOnshapeSecretKey] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const handleSignup = async (e: FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        try {
            const response = await fetch(`${import.meta.env.VITE_CLIENT_URL || ""}/api/auth/signup`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    username,
                    password,
                    onshapeAccessKey,
                    onshapeSecretKey,
                }),
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.message || "Failed to create account.");
            }

            navigate("/signin");
        } catch (err: any) {
            setError(err.message || "An unexpected error occurred.");
        } finally {
            setLoading(false);
        }
    };

    const pageBg = isLight ? "bg-zinc-50 text-zinc-900" : "bg-zinc-950 text-zinc-100";
    const cardBg = isLight ? "bg-white border-zinc-200" : "bg-zinc-900 border-zinc-800";
    const inputBg = isLight ? "bg-zinc-100 border-zinc-300 text-zinc-900" : "bg-zinc-950 border-zinc-700 text-zinc-100";

    return (
        <div className={`min-h-screen flex flex-col items-center justify-center p-6 transition-colors duration-200 ${pageBg}`}>
            <div className={`w-full max-w-md border rounded-2xl p-8 shadow-2xl ${cardBg}`}>
                <div className="mb-6 text-center">
                    <h1 className="text-2xl font-bold tracking-tight">Create Account</h1>
                    <p className={`text-xs mt-1 ${isLight ? "text-zinc-500" : "text-zinc-400"}`}>
                        Configure your account and Onshape integration credentials
                    </p>
                </div>

                {error && (
                    <div className="mb-4 p-3 bg-red-900/50 border border-red-500 rounded-lg text-red-200 text-xs">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSignup} className="space-y-4">
                    <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider mb-1">Account Name</label>
                        <input
                            type="text"
                            required
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className={`w-full px-3 py-2 rounded-lg text-sm border focus:outline-none focus:ring-2 focus:ring-blue-500 ${inputBg}`}
                            placeholder="Enter username"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider mb-1">Password</label>
                        <input
                            type="password"
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className={`w-full px-3 py-2 rounded-lg text-sm border focus:outline-none focus:ring-2 focus:ring-blue-500 ${inputBg}`}
                            placeholder="••••••••"
                        />
                    </div>

                    {/* Onshape Keys Section with } Bracket and Info Link */}
                    <div className="border-t border-zinc-700/50 pt-4 mt-2">
                        <label className="block text-xs font-semibold uppercase tracking-wider mb-2 text-blue-400">
                            Onshape API Credentials
                        </label>
                        <div className="flex items-stretch gap-3">
                            <div className="flex-1 space-y-3">
                                <div>
                                    <label className="block text-[10px] uppercase tracking-wider mb-1 text-zinc-400">Access Token</label>
                                    <input
                                        type="text"
                                        value={onshapeAccessKey}
                                        onChange={(e) => setOnshapeAccessKey(e.target.value)}
                                        className={`w-full px-3 py-2 rounded-lg text-sm border focus:outline-none focus:ring-2 focus:ring-blue-500 ${inputBg}`}
                                        placeholder="Enter Access Token"
                                    />
                                </div>

                                <div>
                                    <label className="block text-[10px] uppercase tracking-wider mb-1 text-zinc-400">Secret Token</label>
                                    <input
                                        type="password"
                                        value={onshapeSecretKey}
                                        onChange={(e) => setOnshapeSecretKey(e.target.value)}
                                        className={`w-full px-3 py-2 rounded-lg text-sm border focus:outline-none focus:ring-2 focus:ring-blue-500 ${inputBg}`}
                                        placeholder="Enter Secret Token"
                                    />
                                </div>
                            </div>

                            {/* } bracket shape and Info icon */}
                            <div className="flex items-center gap-1.5">
                                <svg className="w-3 h-full min-h-[130px] text-blue-500/70" viewBox="0 0 12 100" fill="none" stroke="currentColor" strokeWidth="2.5" preserveAspectRatio="none">
                                    <path d="M 1 2 C 8 2, 8 45, 11 50 C 8 55, 8 98, 1 98" />
                                </svg>
                                <Link
                                    to="/onshape-secrets-tutorial"
                                    title="What are these?"
                                    className="p-1.5 rounded-full bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 transition-colors flex items-center justify-center self-center shadow-sm"
                                >
                                    <Info className="w-4 h-4" />
                                </Link>
                            </div>
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full mt-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-sm font-semibold tracking-wide transition-all shadow-md"
                    >
                        {loading ? "Creating Account..." : "Sign Up"}
                    </button>
                </form>

                <p className={`text-center text-xs mt-6 ${isLight ? "text-zinc-500" : "text-zinc-400"}`}>
                    Already have an account?{" "}
                    <Link to="/signin" className="text-blue-500 hover:underline font-medium">
                        Sign In
                    </Link>
                </p>
            </div>
        </div>
    );
}