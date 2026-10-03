import { useState, type FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useThemeSync } from "../../util/misc/useThemeSync";

export default function Signup() {
    const navigate = useNavigate();
    const { isLight, toggleTheme } = useThemeSync();

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
            <div className="absolute top-6 right-6">
                <button
                    type="button"
                    onClick={toggleTheme}
                    className={`px-3 py-2 rounded font-medium text-sm ${isLight ? "bg-zinc-200 hover:bg-zinc-300 text-zinc-800" : "bg-zinc-800 hover:bg-zinc-700 text-zinc-200"}`}
                >
                    {isLight ? "🌙 Dark Mode" : "☀️ Light Mode"}
                </button>
            </div>

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

                    <div className="border-t border-zinc-700/50 pt-4 mt-2">
                        <label className="block text-xs font-semibold uppercase tracking-wider mb-1 text-blue-400">Onshape Access Token</label>
                        <input
                            type="text"
                            value={onshapeAccessKey}
                            onChange={(e) => setOnshapeAccessKey(e.target.value)}
                            className={`w-full px-3 py-2 rounded-lg text-sm border focus:outline-none focus:ring-2 focus:ring-blue-500 ${inputBg}`}
                            placeholder="Enter Onshape Access Token"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider mb-1 text-blue-400">Onshape Secret Token</label>
                        <input
                            type="password"
                            value={onshapeSecretKey}
                            onChange={(e) => setOnshapeSecretKey(e.target.value)}
                            className={`w-full px-3 py-2 rounded-lg text-sm border focus:outline-none focus:ring-2 focus:ring-blue-500 ${inputBg}`}
                            placeholder="Enter Onshape Secret Token"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full mt-2 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-sm font-semibold tracking-wide transition-all shadow-md"
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