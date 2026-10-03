import { useNavigate } from "react-router-dom";
import { ArrowLeft, Key, ShieldCheck, ExternalLink } from "lucide-react";
import { useThemeSync } from "../../util/misc/useThemeSync";

export default function OnshapeSecretsTutorial() {
    const navigate = useNavigate();
    const { isLight } = useThemeSync();

    const pageBg = isLight ? "bg-zinc-50 text-zinc-900" : "bg-zinc-950 text-zinc-100";
    const cardBg = isLight ? "bg-white border-zinc-200" : "bg-zinc-900 border-zinc-800";

    return (
        <div className={`min-h-screen flex flex-col p-6 transition-colors duration-200 ${pageBg}`}>
            {/* Top Bar */}
            <div className="flex items-center justify-between max-w-3xl w-full mx-auto mb-8">
                <button
                    onClick={() => navigate(-1)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${isLight ? "bg-zinc-200 hover:bg-zinc-300 text-zinc-800" : "bg-zinc-800 hover:bg-zinc-700 text-zinc-200"}`}
                >
                    <ArrowLeft className="w-4 h-4" /> Back
                </button>
            </div>

            {/* Content Card */}
            <div className={`w-full max-w-3xl mx-auto border rounded-2xl p-8 shadow-2xl space-y-6 ${cardBg}`}>
                <div className="border-b pb-4 border-zinc-700/50">
                    <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                        <Key className="w-6 h-6 text-blue-500" /> How to Get Your Onshape API Keys
                    </h1>
                    <p className={`text-xs mt-1 ${isLight ? "text-zinc-500" : "text-zinc-400"}`}>
                        Follow these steps to generate your Access Key and Secret Key from your Onshape Developer Account.
                    </p>
                </div>

                <ol className="space-y-4 text-sm list-decimal list-inside">
                    <li className="pl-2">
                        Go into your ApiKeys page under developer under your account (or click <a href="https://cad.onshape.com/user/developer/apiKeys" target="_blank" rel="noreferrer" className="text-blue-500 hover:underline inline-flex items-center gap-1 font-medium">this <ExternalLink className="w-3 h-3" /></a>link.)
                    </li>
                    <li className="pl-2">
                        press on "Create new API key", and select everything.
                    </li>
                    <li className="pl-2">
                        Copy your generated <b>Access Key</b> and <b>Secret Key</b> and paste them into the signup form.
                    </li>
                </ol>

                <div className={`p-4 rounded-xl border flex items-start gap-3 ${isLight ? "bg-blue-50 border-blue-200 text-blue-900" : "bg-blue-950/40 border-blue-800/50 text-blue-200"}`}>
                    <ShieldCheck className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                    <div className="text-xs space-y-1">
                        <p className="font-semibold">Security Note</p>
                        <p>Your Secret Key is encrypted using AES-256 before being stored in MongoDB. It is never exposed in plain text.</p>
                    </div>
                </div>
            </div>
        </div>
    );
}