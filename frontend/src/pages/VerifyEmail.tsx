import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../services/api';

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('No verification token found in this link.');
      return;
    }
    api.get(`/auth/verify-email?token=${token}`)
      .then(({ data }) => {
        setStatus('success');
        setMessage(data.message);
      })
      .catch((err) => {
        setStatus('error');
        setMessage(err.response?.data?.message || 'Verification failed. The link may have expired.');
      });
  }, [token]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-passport-navy to-blue-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 text-center">
        {status === 'loading' && (
          <>
            <span className="text-6xl">⏳</span>
            <h1 className="text-xl font-bold text-gray-800 mt-4">Verifying your email...</h1>
          </>
        )}
        {status === 'success' && (
          <>
            <span className="text-6xl">✅</span>
            <h1 className="text-xl font-bold text-passport-navy mt-4">Email Verified!</h1>
            <p className="text-gray-500 text-sm mt-2">{message}</p>
            <Link
              to="/login"
              className="mt-6 inline-block bg-passport-navy text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-900 transition text-sm"
            >
              Sign In
            </Link>
          </>
        )}
        {status === 'error' && (
          <>
            <span className="text-6xl">❌</span>
            <h1 className="text-xl font-bold text-gray-800 mt-4">Verification Failed</h1>
            <p className="text-gray-500 text-sm mt-2">{message}</p>
            <div className="mt-6 space-y-2">
              <Link to="/login" className="block text-passport-navy font-medium hover:underline text-sm">
                Back to Sign In
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
