import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';

interface VerifyResult {
  valid: boolean;
  expired: boolean;
  passport_number: string;
  full_name: string;
  nationality: string;
  gender: string;
  date_of_birth: string;
  passport_type: string;
  issued_at: string;
  expires_at: string;
  photo_path: string | null;
}

export default function Verify() {
  const { passport_number } = useParams<{ passport_number: string }>();
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get(`/api/verify/${passport_number}`)
      .then(({ data }) => { setResult(data); setLoading(false); })
      .catch(() => { setError('Passport not found or not approved'); setLoading(false); });
  }, [passport_number]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400">Verifying passport...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-6">
          <span className="text-4xl">🛂</span>
          <h1 className="text-xl font-bold text-passport-navy mt-2">E-Passport Verification</h1>
          <p className="text-gray-400 text-sm">Official document verification system</p>
        </div>

        {error || !result ? (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-8 text-center">
            <span className="text-5xl">❌</span>
            <h2 className="text-xl font-bold text-red-600 mt-3">Invalid Passport</h2>
            <p className="text-red-500 text-sm mt-1">{error || 'This passport number is not recognized.'}</p>
            <p className="text-xs text-gray-400 mt-4 font-mono">{passport_number}</p>
          </div>
        ) : result.expired ? (
          <div className="bg-orange-50 border border-orange-200 rounded-2xl p-8 text-center">
            <span className="text-5xl">⚠️</span>
            <h2 className="text-xl font-bold text-orange-600 mt-3">Passport Expired</h2>
            <p className="text-orange-500 text-sm mt-1">This passport expired on {result.expires_at}</p>
            <p className="text-xs text-gray-400 mt-2 font-mono">{passport_number}</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-xl border-2 border-green-400 overflow-hidden">
            {/* Valid banner */}
            <div className="bg-green-500 text-white px-6 py-3 flex items-center gap-3">
              <span className="text-2xl">✅</span>
              <div>
                <p className="font-bold text-sm">VALID PASSPORT</p>
                <p className="text-green-100 text-xs">Verified by E-Passport System</p>
              </div>
            </div>

            {/* Passport details */}
            <div className="p-6 flex gap-4">
              {result.photo_path ? (
                <img
                  src={`/uploads/${result.photo_path}`}
                  alt="Passport photo"
                  className="w-20 h-24 object-cover rounded-lg border-2 border-gray-200 flex-shrink-0"
                />
              ) : (
                <div className="w-20 h-24 bg-gray-100 rounded-lg border-2 border-gray-200 flex items-center justify-center flex-shrink-0">
                  <span className="text-gray-300 text-2xl">👤</span>
                </div>
              )}
              <div className="flex-1 space-y-2 text-sm">
                {[
                  ['Passport No.', result.passport_number],
                  ['Full Name', result.full_name],
                  ['Nationality', result.nationality],
                  ['Date of Birth', result.date_of_birth],
                  ['Gender', result.gender?.toUpperCase()],
                  ['Type', result.passport_type],
                  ['Issued', result.issued_at],
                  ['Expires', result.expires_at],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between">
                    <span className="text-gray-400 text-xs">{label}</span>
                    <span className="font-semibold text-gray-700 text-xs capitalize">{value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="px-6 pb-4 text-center">
              <p className="text-xs text-gray-400">
                Verified on {new Date().toLocaleString()}
              </p>
            </div>
          </div>
        )}

        <p className="text-center text-xs text-gray-400 mt-6">
          <Link to="/login" className="hover:underline text-passport-navy">← Return to E-Passport Portal</Link>
        </p>
      </div>
    </div>
  );
}
