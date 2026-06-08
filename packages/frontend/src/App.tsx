import { useState, useEffect } from 'react';

interface ApiResponse {
  message: string;
  timestamp: string;
}

/**
 * Loads runtime config from config.json (deployed by the deploy scripts).
 * Falls back to localhost for local development.
 * @returns The API base URL
 */
async function getApiUrl(): Promise<string> {
  try {
    const res = await fetch('/config.json');
    if (res.ok) {
      const config = await res.json();
      return config.apiUrl;
    }
  } catch {
    // config.json not available (local dev)
  }
  return 'http://localhost:3000';
}

/**
 * Main application component that calls the hello API and displays the result.
 * @returns The rendered App component
 */
function App(): React.ReactNode {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHello = async () => {
      try {
        const apiUrl = await getApiUrl();
        const res = await fetch(`${apiUrl}/hello`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };
    fetchHello();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">
          Light Agentic Template
        </h1>
        {loading && (
          <p className="text-gray-500">Loading...</p>
        )}
        {error && (
          <div className="bg-red-50 text-red-700 p-3 rounded">
            <p className="font-medium">API Error</p>
            <p className="text-sm">{error}</p>
          </div>
        )}
        {data && (
          <div className="space-y-2">
            <p className="text-lg text-gray-700">{data.message}</p>
            <p className="text-sm text-gray-400">
              {new Date(data.timestamp).toLocaleString()}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
