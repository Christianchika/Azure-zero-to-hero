import React, { useState, useEffect } from 'react';
import { Flame, MessageCircle, User, ShieldAlert, Heart, X, Lock, Eye, EyeOff, Send, LogOut, CheckCircle } from 'lucide-react';
import io from 'socket.io-client';

const API_BASE = 'http://localhost:5000/api';

export default function App() {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [activeTab, setActiveTab] = useState('discover'); // 'discover' | 'matches' | 'chat' | 'profile'

  // Auth state
  const [isLogin, setIsLogin] = useState(true);
  const [ageVerified, setAgeVerified] = useState(false);
  const [authForm, setAuthForm] = useState({
    email: '',
    password: '',
    name: '',
    age: '24',
    gender: 'female',
    target_gender: 'male',
    intent: 'pleasure & fun',
    bio: 'Looking for exciting connections and pure pleasure.',
    photo_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=500&auto=format&fit=crop&q=80'
  });
  const [authError, setAuthError] = useState('');

  // App data state
  const [candidates, setCandidates] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [matches, setMatches] = useState([]);
  const [activeMatch, setActiveMatch] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputMsg, setInputMsg] = useState('');
  const [matchPopup, setMatchPopup] = useState(null);
  const [socket, setSocket] = useState(null);

  // Safety & profile state
  const [ghostMode, setGhostMode] = useState(false);
  const [reportModal, setReportModal] = useState(null);
  const [reportReason, setReportReason] = useState('');

  // Init auth check
  useEffect(() => {
    if (token) {
      fetch(`${API_BASE}/users/me`, {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(res => res.json())
        .then(data => {
          if (data.id) {
            setUser(data);
            setGhostMode(Boolean(data.is_ghost_mode));
          } else {
            handleLogout();
          }
        })
        .catch(() => handleLogout());
    }
  }, [token]);

  // Connect socket when user is logged in
  useEffect(() => {
    if (user && token) {
      const newSocket = io('http://localhost:5000', {
        auth: { userId: user.id }
      });

      newSocket.on('receive_message', (msg) => {
        if (activeMatch && msg.match_id === activeMatch.match_id) {
          setMessages(prev => [...prev, msg]);
        }
      });

      setSocket(newSocket);
      return () => newSocket.disconnect();
    }
  }, [user, activeMatch]);

  // Fetch candidates when in discover mode
  useEffect(() => {
    if (user && activeTab === 'discover') {
      fetch(`${API_BASE}/matches/discovery`, {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data)) {
            setCandidates(data);
            setCurrentIdx(0);
          }
        });
    }
  }, [user, activeTab]);

  // Fetch matches
  useEffect(() => {
    if (user && (activeTab === 'matches' || activeTab === 'chat')) {
      fetch(`${API_BASE}/matches`, {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data)) setMatches(data);
        });
    }
  }, [user, activeTab]);

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthError('');

    if (!isLogin && !ageVerified) {
      setAuthError('You must verify that you are at least 18 years of age.');
      return;
    }

    const endpoint = isLogin ? '/auth/login' : '/auth/register';
    const bodyData = isLogin
      ? { email: authForm.email, password: authForm.password }
      : { ...authForm, age: Number(authForm.age) };

    try {
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyData)
      });
      const data = await res.json();

      if (!res.ok) {
        setAuthError(data.error || 'Authentication failed');
        return;
      }

      localStorage.setItem('token', data.token);
      setToken(data.token);
      setUser(data.user);
    } catch (err) {
      setAuthError('Network error connecting to server');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setToken('');
    setUser(null);
  };

  const handleSwipe = (type) => {
    const target = candidates[currentIdx];
    if (!target) return;

    fetch(`${API_BASE}/matches/swipe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ targetUserId: target.id, type })
    })
      .then(res => res.json())
      .then(data => {
        if (data.isMatch) {
          setMatchPopup(data.matchedUser);
        }
        setCurrentIdx(prev => prev + 1);
      });
  };

  const openChat = (match) => {
    setActiveMatch(match);
    setActiveTab('chat');
    if (socket) {
      socket.emit('join_room', { matchId: match.match_id });
    }

    fetch(`${API_BASE}/chat/history/${match.match_id}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setMessages(data);
      });
  };

  const sendMessage = (e) => {
    e.preventDefault();
    if (!inputMsg.trim() || !activeMatch || !socket) return;

    socket.emit('send_message', {
      matchId: activeMatch.match_id,
      recipientId: activeMatch.user_id,
      content: inputMsg
    });

    setInputMsg('');
  };

  const toggleGhostMode = () => {
    const newMode = !ghostMode;
    setGhostMode(newMode);
    fetch(`${API_BASE}/users/me`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ is_ghost_mode: newMode ? 1 : 0 })
    });
  };

  const handleReportUser = () => {
    if (!reportModal || !reportReason) return;

    fetch(`${API_BASE}/users/report`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ reportedId: reportModal.id, reason: reportReason })
    }).then(() => {
      alert('User reported successfully. Thank you for keeping our community safe.');
      setReportModal(null);
      setReportReason('');
    });
  };

  const handleBlockUser = (blockedId) => {
    if (window.confirm('Are you sure you want to block this user?')) {
      fetch(`${API_BASE}/users/block`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ blockedId })
      }).then(() => {
        alert('User blocked.');
        setActiveTab('discover');
        setActiveMatch(null);
      });
    }
  };

  // Render Login / Registration UI if not authenticated
  if (!user) {
    return (
      <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ display: 'inline-flex', padding: '12px', background: 'rgba(255, 51, 102, 0.1)', borderRadius: '50%', marginBottom: '12px' }}>
            <Flame size={40} color="#ff3366" />
          </div>
          <h1 className="brand" style={{ fontSize: '28px', justifyContent: 'center' }}>PleasureLink</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '6px' }}>Adult Matchmaking & Desire Connections (18+)</p>
        </div>

        {authError && (
          <div style={{ background: 'rgba(239, 68, 68, 0.2)', border: '1px solid #ef4444', padding: '12px', borderRadius: '10px', color: '#f8fafc', fontSize: '14px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShieldAlert size={18} color="#ef4444" />
            {authError}
          </div>
        )}

        <form onSubmit={handleAuthSubmit}>
          {!isLogin && (
            <>
              <input
                className="input-field"
                type="text"
                placeholder="Full Name / Display Alias"
                value={authForm.name}
                onChange={e => setAuthForm({ ...authForm, name: e.target.value })}
                required
              />
              <div style={{ display: 'flex', gap: '10px' }}>
                <input
                  className="input-field"
                  type="number"
                  placeholder="Age (18+)"
                  value={authForm.age}
                  onChange={e => setAuthForm({ ...authForm, age: e.target.value })}
                  required
                />
                <select
                  className="input-field"
                  value={authForm.gender}
                  onChange={e => setAuthForm({ ...authForm, gender: e.target.value })}
                >
                  <option value="female">I am Female</option>
                  <option value="male">I am Male</option>
                  <option value="non-binary">Non-binary</option>
                </select>
              </div>

              <select
                className="input-field"
                value={authForm.target_gender}
                onChange={e => setAuthForm({ ...authForm, target_gender: e.target.value })}
              >
                <option value="male">Seeking Men</option>
                <option value="female">Seeking Women</option>
                <option value="everyone">Seeking Everyone</option>
              </select>

              <input
                className="input-field"
                type="text"
                placeholder="What are you seeking? (e.g. Pure pleasure, Casual dating)"
                value={authForm.intent}
                onChange={e => setAuthForm({ ...authForm, intent: e.target.value })}
              />

              <input
                className="input-field"
                type="url"
                placeholder="Profile Photo URL"
                value={authForm.photo_url}
                onChange={e => setAuthForm({ ...authForm, photo_url: e.target.value })}
              />

              {/* Age Verification Gate Checkbox */}
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-muted)', margin: '8px 0 16px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={ageVerified}
                  onChange={e => setAgeVerified(e.target.checked)}
                />
                I confirm I am 18 years of age or older and agree to adult terms.
              </label>
            </>
          )}

          <input
            className="input-field"
            type="email"
            placeholder="Email Address"
            value={authForm.email}
            onChange={e => setAuthForm({ ...authForm, email: e.target.value })}
            required
          />
          <input
            className="input-field"
            type="password"
            placeholder="Password"
            value={authForm.password}
            onChange={e => setAuthForm({ ...authForm, password: e.target.value })}
            required
          />

          <button type="submit" className="btn-primary" style={{ marginTop: '10px' }}>
            {isLogin ? 'Sign In to Connect' : 'Create Adult Account'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '20px' }}>
          <button
            onClick={() => { setIsLogin(!isLogin); setAuthError(''); }}
            style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: '14px' }}
          >
            {isLogin ? "Don't have an account? Sign Up" : 'Already registered? Sign In'}
          </button>
        </div>
      </div>
    );
  }

  const currentCandidate = candidates[currentIdx];

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <header className="header">
        <div className="brand">
          <Flame size={24} color="#ff3366" />
          <span>PleasureLink</span>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button
            onClick={toggleGhostMode}
            title={ghostMode ? "Ghost Mode Active (Profile Hidden)" : "Ghost Mode Off"}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: ghostMode ? '#fbbf24' : '#94a3b8' }}
          >
            {ghostMode ? <EyeOff size={22} /> : <Eye size={22} />}
          </button>
          <button onClick={handleLogout} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
            <LogOut size={20} />
          </button>
        </div>
      </header>

      {/* Main View Area */}
      <div style={{ flex: 1, overflowY: 'auto', position: 'relative' }}>
        {/* Discovery View */}
        {activeTab === 'discover' && (
          <div className="card-container">
            {currentCandidate ? (
              <div
                className="profile-card"
                style={{
                  backgroundImage: `url(${currentCandidate.photo_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=500&auto=format&fit=crop&q=80'})`
                }}
              >
                <div className="profile-info">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                    <div>
                      <h2 style={{ fontSize: '24px', fontWeight: 700 }}>
                        {currentCandidate.name}, {currentCandidate.age}
                      </h2>
                      <p style={{ color: '#fbbf24', fontSize: '13px', fontWeight: 600, marginTop: '2px' }}>
                        Seeking: {currentCandidate.intent}
                      </p>
                    </div>
                    <button
                      onClick={() => setReportModal(currentCandidate)}
                      style={{ background: 'rgba(0,0,0,0.5)', border: 'none', borderRadius: '50%', padding: '8px', color: '#ef4444', cursor: 'pointer' }}
                    >
                      <ShieldAlert size={18} />
                    </button>
                  </div>

                  <p style={{ color: '#cbd5e1', fontSize: '14px', margin: '10px 0' }}>
                    {currentCandidate.bio}
                  </p>

                  <div className="swipe-actions">
                    <button className="btn-circle btn-pass" onClick={() => handleSwipe('pass')}>
                      <X size={28} />
                    </button>
                    <button className="btn-circle btn-like" onClick={() => handleSwipe('like')}>
                      <Heart size={28} fill="white" />
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
                <Flame size={48} color="#8a2be2" style={{ marginBottom: '16px', opacity: 0.5 }} />
                <h3>No More Profiles Nearby</h3>
                <p style={{ fontSize: '14px', marginTop: '8px' }}>Check back soon or adjust your preferences in your profile.</p>
              </div>
            )}
          </div>
        )}

        {/* Matches List View */}
        {activeTab === 'matches' && (
          <div style={{ padding: '16px' }}>
            <h3 style={{ marginBottom: '16px', fontSize: '18px' }}>Your Pleasure Matches</h3>
            {matches.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '14px', textAlign: 'center', marginTop: '40px' }}>
                No matches yet. Keep swiping on profiles in Discovery!
              </p>
            ) : (
              matches.map(m => (
                <div
                  key={m.match_id}
                  onClick={() => openChat(m)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '14px',
                    padding: '12px',
                    borderRadius: '12px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    marginBottom: '10px',
                    cursor: 'pointer'
                  }}
                >
                  <img
                    src={m.photo_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=500&auto=format&fit=crop&q=80'}
                    alt={m.name}
                    style={{ width: '54px', height: '54px', borderRadius: '50%', objectFit: 'cover' }}
                  />
                  <div style={{ flex: 1 }}>
                    <h4 style={{ fontSize: '16px', color: '#f8fafc' }}>{m.name}</h4>
                    <p style={{ fontSize: '13px', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '200px' }}>
                      {m.last_message || 'New Match! Start the conversation...'}
                    </p>
                  </div>
                  <MessageCircle size={20} color="var(--primary)" />
                </div>
              ))
            )}
          </div>
        )}

        {/* Real-time Chat View */}
        {activeTab === 'chat' && activeMatch && (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Chat header */}
            <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(15, 23, 42, 0.9)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <img
                  src={activeMatch.photo_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=500&auto=format&fit=crop&q=80'}
                  alt={activeMatch.name}
                  style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover' }}
                />
                <div>
                  <h4 style={{ fontSize: '15px' }}>{activeMatch.name}</h4>
                  <span style={{ fontSize: '11px', color: '#22c55e' }}>● Online</span>
                </div>
              </div>
              <button onClick={() => handleBlockUser(activeMatch.user_id)} style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '12px', cursor: 'pointer' }}>
                Block User
              </button>
            </div>

            {/* Messages body */}
            <div style={{ flex: 1, padding: '16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {messages.map((msg, i) => {
                const isMe = msg.sender_id === user.id;
                return (
                  <div
                    key={msg.id || i}
                    style={{
                      alignSelf: isMe ? 'flex-end' : 'flex-start',
                      maxWidth: '75%',
                      padding: '10px 14px',
                      borderRadius: '16px',
                      background: isMe ? 'linear-gradient(135deg, var(--primary), var(--secondary))' : 'rgba(255, 255, 255, 0.1)',
                      color: 'white',
                      fontSize: '14px'
                    }}
                  >
                    {msg.content}
                  </div>
                );
              })}
            </div>

            {/* Input area */}
            <form onSubmit={sendMessage} style={{ padding: '12px', borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', gap: '8px' }}>
              <input
                className="input-field"
                style={{ marginBottom: 0 }}
                type="text"
                placeholder="Type a discrete message..."
                value={inputMsg}
                onChange={e => setInputMsg(e.target.value)}
              />
              <button type="submit" className="btn-primary" style={{ width: 'auto', padding: '0 16px' }}>
                <Send size={18} />
              </button>
            </form>
          </div>
        )}

        {/* Profile / Privacy View */}
        {activeTab === 'profile' && (
          <div style={{ padding: '20px' }}>
            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <img
                src={user.photo_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=500&auto=format&fit=crop&q=80'}
                alt={user.name}
                style={{ width: '90px', height: '90px', borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--primary)' }}
              />
              <h2 style={{ marginTop: '10px', fontSize: '20px' }}>{user.name}, {user.age}</h2>
              <span style={{ fontSize: '12px', color: '#fbbf24', background: 'rgba(251, 191, 36, 0.1)', padding: '4px 10px', borderRadius: '12px' }}>
                Verified 18+ Member
              </span>
            </div>

            <div style={{ background: 'rgba(255, 255, 255, 0.05)', borderRadius: '16px', padding: '16px', marginBottom: '16px' }}>
              <h4 style={{ marginBottom: '12px', fontSize: '15px' }}>Privacy & Safety Controls</h4>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 600 }}>Ghost Mode</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Hide your profile from new discovery</div>
                </div>
                <input
                  type="checkbox"
                  checked={ghostMode}
                  onChange={toggleGhostMode}
                  style={{ width: '20px', height: '20px' }}
                />
              </div>
            </div>

            <div style={{ background: 'rgba(255, 255, 255, 0.05)', borderRadius: '16px', padding: '16px' }}>
              <h4 style={{ marginBottom: '12px', fontSize: '15px' }}>Profile Details</h4>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}><strong>Desire Intent:</strong> {user.intent}</p>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '6px' }}><strong>Bio:</strong> {user.bio || 'No bio provided'}</p>
            </div>
          </div>
        )}
      </div>

      {/* Match Celebration Modal */}
      {matchPopup && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.95)', zIndex: 100, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', textAlign: 'center' }}>
          <Flame size={60} color="#ff3366" />
          <h1 style={{ fontSize: '32px', margin: '16px 0', background: 'linear-gradient(135deg, #ff3366, #fbbf24)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            It's a Pleasure Match!
          </h1>
          <p style={{ color: '#cbd5e1', marginBottom: '24px' }}>You and {matchPopup.name} have expressed mutual desire for each other.</p>
          <img
            src={matchPopup.photo_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=500&auto=format&fit=crop&q=80'}
            alt={matchPopup.name}
            style={{ width: '120px', height: '120px', borderRadius: '50%', objectFit: 'cover', border: '4px solid var(--primary)', marginBottom: '24px' }}
          />
          <button
            className="btn-primary"
            onClick={() => {
              const matchedObj = matches.find(m => m.user_id === matchPopup.id) || { match_id: 1, user_id: matchPopup.id, name: matchPopup.name, photo_url: matchPopup.photo_url };
              setMatchPopup(null);
              openChat(matchedObj);
            }}
          >
            Send Discrete Message
          </button>
          <button
            onClick={() => setMatchPopup(null)}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', marginTop: '16px', cursor: 'pointer' }}
          >
            Keep Browsing
          </button>
        </div>
      )}

      {/* User Report Modal */}
      {reportModal && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.9)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
          <div style={{ background: '#1e293b', borderRadius: '16px', padding: '20px', width: '100%' }}>
            <h3>Report {reportModal.name}</h3>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '8px 0 16px' }}>Help keep PleasureLink safe and respectful.</p>
            <textarea
              className="input-field"
              rows="3"
              placeholder="Reason for reporting..."
              value={reportReason}
              onChange={e => setReportReason(e.target.value)}
            />
            <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
              <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setReportModal(null)}>Cancel</button>
              <button className="btn-primary" style={{ flex: 1, background: '#ef4444' }} onClick={handleReportUser}>Submit Report</button>
            </div>
          </div>
        </div>
      )}

      {/* Navigation Bar */}
      <nav className="nav-tabs">
        <button className={`nav-tab ${activeTab === 'discover' ? 'active' : ''}`} onClick={() => setActiveTab('discover')}>
          <Flame size={22} />
          <span>Discover</span>
        </button>
        <button className={`nav-tab ${activeTab === 'matches' || activeTab === 'chat' ? 'active' : ''}`} onClick={() => setActiveTab('matches')}>
          <MessageCircle size={22} />
          <span>Matches</span>
        </button>
        <button className={`nav-tab ${activeTab === 'profile' ? 'active' : ''}`} onClick={() => setActiveTab('profile')}>
          <User size={22} />
          <span>Profile</span>
        </button>
      </nav>
    </div>
  );
}
