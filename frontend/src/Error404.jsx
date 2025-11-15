import React from 'react';

export default function Error404() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-white rounded-xl shadow p-8 text-center">
        <h1 className="text-4xl font-bold text-gray-900 mb-2">404</h1>
        <p className="text-gray-600 mb-6">The page you are looking for could not be found.</p>
        <a href="/" className="inline-block px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">
          Go Home
        </a>
      </div>
    </div>
  );
}


