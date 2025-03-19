import React from 'react';
import Head from 'next/head';
import Link from 'next/link';

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-8">
      <Head>
        <title>AI Creation Assistant</title>
        <meta name="description" content="A scalable, multi-tenant AI content creation platform with usage tracking and budget controls" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className="w-full max-w-6xl">
        <header className="mb-12 text-center">
          <h1 className="text-4xl font-bold text-gray-900 mb-3">
            AI Creation Assistant
          </h1>
          <p className="text-lg text-gray-600">
            Create content with AI, track usage, and manage subscriptions
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
          <div className="bg-white p-8 rounded-lg shadow-md border border-gray-200">
            <h2 className="text-2xl font-semibold mb-4">Start Creating</h2>
            <p className="text-gray-600 mb-6">
              Use our AI-powered tools to generate and refine content with built-in token usage tracking and controls.
            </p>
            <Link href="/dashboard" className="inline-flex items-center justify-center px-5 py-3 border border-transparent text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700">
              Go to Dashboard
            </Link>
          </div>
          
          <div className="bg-white p-8 rounded-lg shadow-md border border-gray-200">
            <h2 className="text-2xl font-semibold mb-4">Subscription &amp; Usage</h2>
            <p className="text-gray-600 mb-6">
              View your current subscription plan, track token usage, and manage billing details.
            </p>
            <Link href="/subscription" className="inline-flex items-center justify-center px-5 py-3 border border-transparent text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700">
              Manage Subscription
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 bg-blue-50 rounded-lg">
            <h3 className="font-medium text-lg text-blue-800 mb-2">Real-time Collaboration</h3>
            <p className="text-blue-600">
              Work together with your team in real-time with our collaborative editor.
            </p>
          </div>
          <div className="p-6 bg-green-50 rounded-lg">
            <h3 className="font-medium text-lg text-green-800 mb-2">Usage Tracking</h3>
            <p className="text-green-600">
              Monitor token usage with detailed analytics and set budget thresholds.
            </p>
          </div>
          <div className="p-6 bg-purple-50 rounded-lg">
            <h3 className="font-medium text-lg text-purple-800 mb-2">Multi-tenant Support</h3>
            <p className="text-purple-600">
              Enterprise-grade isolation between organizations and users.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}