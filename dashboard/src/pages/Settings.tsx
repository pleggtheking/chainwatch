import { useState } from 'react';
import { setApiKey, clearApiKey, api } from '../api.js';

export default function Settings() {
  const [keyInput, setKeyInput] = useState('');
  const [slackUrl, setSlackUrl] = useState('');
  const [slackMinSeverity, setSlackMinSeverity] = useState('high');
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testLoading, setTestLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  function handleSaveKey() {
    if (keyInput.trim()) {
      setApiKey(keyInput.trim());
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  }

  function handleClearKey() {
    clearApiKey();
    setKeyInput('');
    window.location.reload();
  }

  async function handleTestSlack() {
    if (!slackUrl.trim()) {
      setTestResult('Enter a Slack webhook URL first.');
      return;
    }
    setTestLoading(true);
    setTestResult(null);
    try {
      const result = await api.testAlert('slack', { url: slackUrl.trim() });
      setTestResult(result.success ? '✅ Test alert sent successfully!' : `❌ ${result.message}`);
    } catch (e) {
      setTestResult(`❌ ${(e as Error).message}`);
    } finally {
      setTestLoading(false);
    }
  }

  async function handleSaveSlack() {
    if (!slackUrl.trim()) return;
    try {
      await api.createAlert('slack', { url: slackUrl.trim() }, slackMinSeverity);
      setTestResult('✅ Slack alert saved.');
    } catch (e) {
      setTestResult(`❌ ${(e as Error).message}`);
    }
  }

  return (
    <div className="space-y-8 max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900">Settings</h1>

      {/* API Key */}
      <section className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">API Key</h2>
        <p className="text-sm text-gray-500 mb-4">
          Your ChainWatch API key authenticates all dashboard requests.
          Get one by running <code className="bg-gray-100 px-1 rounded">chainwatch sync</code> or
          creating a workspace at the API.
        </p>
        <div className="flex gap-2">
          <input
            type="password"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder="cw_<workspace>_<key>"
            className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm font-mono"
          />
          <button
            onClick={handleSaveKey}
            className="px-4 py-2 bg-chainwatch-red text-white rounded text-sm font-medium hover:bg-red-700"
          >
            Save
          </button>
          <button
            onClick={handleClearKey}
            className="px-4 py-2 border border-gray-300 rounded text-sm text-gray-600 hover:bg-gray-50"
          >
            Clear
          </button>
        </div>
        {saved && <p className="text-sm text-green-600 mt-2">✅ Key saved.</p>}
      </section>

      {/* Slack Integration */}
      <section className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Slack Integration</h2>
        <p className="text-sm text-gray-500 mb-4">
          Get alerts in Slack when ChainWatch finds CRITICAL or HIGH severity issues.
          Create a Slack incoming webhook at{' '}
          <a href="https://api.slack.com/messaging/webhooks" target="_blank" rel="noreferrer"
             className="text-chainwatch-red underline">
            api.slack.com/messaging/webhooks
          </a>.
        </p>
        <div className="space-y-3">
          <input
            type="url"
            value={slackUrl}
            onChange={(e) => setSlackUrl(e.target.value)}
            placeholder="https://hooks.slack.com/services/T.../B.../..."
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm font-mono"
          />
          <div className="flex items-center gap-3">
            <label className="text-sm text-gray-600">Minimum severity:</label>
            <select
              value={slackMinSeverity}
              onChange={(e) => setSlackMinSeverity(e.target.value)}
              className="text-sm border border-gray-300 rounded px-2 py-1"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSaveSlack}
              className="px-4 py-2 bg-chainwatch-red text-white rounded text-sm font-medium hover:bg-red-700"
            >
              Save Alert Config
            </button>
            <button
              onClick={handleTestSlack}
              disabled={testLoading}
              className="px-4 py-2 border border-gray-300 rounded text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              {testLoading ? 'Sending...' : 'Send Test Alert'}
            </button>
          </div>
          {testResult && <p className="text-sm mt-2">{testResult}</p>}
        </div>
      </section>
    </div>
  );
}
