import React, { useState, useRef } from 'react';
import Meyda from 'meyda';

function averageVectors(vectors) {
  if (!vectors.length) return null;
  const len = vectors[0].length;
  const avg = new Array(len).fill(0);
  for (const v of vectors) for (let i = 0; i < len; i++) avg[i] += v[i];
  for (let i = 0; i < len; i++) avg[i] /= vectors.length;
  return avg;
}

function cosineSim(a, b) {
  let num = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { num += a[i]*b[i]; na += a[i]*a[i]; nb += b[i]*b[i]; }
  return num / (Math.sqrt(na) * Math.sqrt(nb) + 1e-9);
}

export default function VoiceEnroll({ onEnrollSuccess }) {
  const [status, setStatus] = useState('idle');
  const audioCtxRef = useRef(null);
  const sourceRef = useRef(null);

  async function recordFor(seconds = 3) {
    setStatus('recording');
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    sourceRef.current = audioCtxRef.current.createMediaStreamSource(stream);

    const bufferSize = 512;
    const mfccs = [];
    const analyzer = Meyda.createMeydaAnalyzer({
      audioContext: audioCtxRef.current,
      source: sourceRef.current,
      bufferSize,
      featureExtractors: ['mfcc'],
      callback: (features) => {
        if (features && features.mfcc) mfccs.push(features.mfcc.slice(2));
      }
    });

    analyzer.start();

    await new Promise(res => setTimeout(res, seconds*1000));

    analyzer.stop();
    stream.getTracks().forEach(t => t.stop());
    audioCtxRef.current.close();

    setStatus('idle');
    return averageVectors(mfccs);
  }

  async function handleEnroll() {
    try {
      setStatus('enrolling');
      const samples = [];
      for (let i=0;i<3;i++) {
        alert('Please say your voice passphrase now (short sentence) — sample ' + (i+1) + ' of 3');
        const v = await recordFor(2.2);
        if (v) samples.push(v);
      }
      const avg = averageVectors(samples);
      if (!avg) { alert('Enrollment failed'); setStatus('idle'); return; }
      localStorage.setItem('voice_fingerprint', JSON.stringify(avg));
      setStatus('done');
      alert('Enrollment saved.');
      if (onEnrollSuccess) onEnrollSuccess();
    } catch (err) {
      console.error(err); setStatus('idle'); alert('Error during enrollment: ' + err.message);
    }
  }

  async function handleVerify() {
    try {
      setStatus('verifying');
      const stored = localStorage.getItem('voice_fingerprint');
      if (!stored) { alert('No fingerprint enrolled'); setStatus('idle'); return; }
      const storedVec = JSON.parse(stored);
      alert('Please say the same passphrase now for verification');
      const v = await recordFor(2.2);
      if (!v) { alert('No voice captured'); setStatus('idle'); return; }
      const sim = cosineSim(storedVec, v);
      setStatus('idle');
      const STRENGTH_THRESHOLD = 0.95; const ok = sim > STRENGTH_THRESHOLD;
      alert('Similarity: ' + sim.toFixed(3) + (ok ? '\nVoice accepted' : '\nVoice rejected'));
      return ok;
    } catch (err) {
      console.error(err); setStatus('idle'); alert('Error: ' + err.message);
    }
  }

  return (
    <div className="voice-enroll">
      <div>Status: {status}</div>
      <div className="mt-2">
        <button onClick={handleEnroll} className="btn voice-btn-enroll">Enroll Voice</button>
        <button onClick={handleVerify} className="btn voice-btn-verify ml-2">Verify Voice</button>
      </div>
      <div className="mt-2 text-sm text-gray-600">
        Enrollment stores a local fingerprint. For better security use server-side speaker verification.
      </div>
    </div>
  )
}
