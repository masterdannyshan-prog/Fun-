import { useEffect, useRef, useState } from 'react'
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision'
import { detectStaticSign } from './gestures'

const CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [0,9],[9,10],[10,11],[11,12],
  [0,13],[13,14],[14,15],[15,16],
  [0,17],[17,18],[18,19],[19,20],
  [5,9],[9,13],[13,17]
]

const SIGN_GUIDE = [
  { sign: 'Hello',      hint: 'All 5 fingers open'       },
  { sign: 'Wait',       hint: '4 fingers, thumb tucked'  },
  { sign: 'Stop',       hint: 'Closed fist'              },
  { sign: 'Yes',        hint: 'Thumbs up'                },
  { sign: 'OK',         hint: 'Thumb + index circle'     },
  { sign: 'I Love You', hint: 'Index + pinky + thumb'    },
  { sign: 'You',        hint: 'Index finger point'       },
  { sign: 'Peace',      hint: 'V fingers spread wide'    },
  { sign: 'No',         hint: 'V fingers close together' },
  { sign: 'Thank You',  hint: '3 fingers up'             },
  { sign: 'Sorry',      hint: 'L shape (index + thumb)'  },
  { sign: 'Please',     hint: 'Y shape (thumb + pinky)'  },
]

function lerp(a, b, t) { return a + (b - a) * t }

function smoothLandmarks(current, target, speed = 0.35) {
  if (!current || current.length !== target.length) return target.map(p => ({ ...p }))
  return current.map((p, i) => ({
    x: lerp(p.x, target[i].x, speed),
    y: lerp(p.y, target[i].y, speed),
    z: lerp(p.z, target[i].z, speed)
  }))
}

function fmtTime(d) {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// Apple system palette
const C = {
  canvas:   '#F5F5F7',
  card:     '#FFFFFF',
  chip:     '#F2F2F7',
  chipHov:  '#EAEAEF',
  divider:  'rgba(0,0,0,0.06)',
  text:     '#1D1D1F',
  text2:    '#6E6E73',
  text3:    '#86868B',
  accent:   '#0071E3',
  accentBg: 'rgba(0,113,227,0.08)',
}

export default function App() {
  const videoRef      = useRef(null)
  const canvasRef     = useRef(null)
  const historyEndRef = useRef(null)

  const [sign, setSign]               = useState(null)
  const [started, setStarted]         = useState(false)
  const [signHistory, setSignHistory] = useState([])

  const rawLandmarksRef    = useRef([])
  const smoothLandmarksRef = useRef([])
  const lastSignRef        = useRef(null)
  const holdCountRef       = useRef(0)
  const lastSpokenRef      = useRef(null)

  useEffect(() => {
    historyEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [signHistory])

  useEffect(() => {
    if (!started) return

    let handLandmarker
    let animationId
    let detectionInterval

    async function setup() {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true })
      const video  = videoRef.current
      video.srcObject = stream
      await new Promise(resolve => video.addEventListener('loadeddata', resolve, { once: true }))

      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm'
      )
      handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
          delegate: 'CPU'
        },
        numHands: 2,
        runningMode: 'VIDEO'
      })

      detectionInterval = setInterval(() => {
        const video = videoRef.current
        if (!handLandmarker || !video || video.readyState < 2) return
        const results = handLandmarker.detectForVideo(video, performance.now())
        rawLandmarksRef.current = results.landmarks

        if (results.landmarks.length === 0) {
          lastSignRef.current = null
          holdCountRef.current = 0
          lastSpokenRef.current = null
          setSign(null)
          return
        }

        const lm       = results.landmarks[0]
        const detected = detectStaticSign(lm)

        if (detected === lastSignRef.current) {
          holdCountRef.current += 1
          if (holdCountRef.current === 8) {
            setSign(detected)
            if (detected && detected !== lastSpokenRef.current) {
              lastSpokenRef.current = detected
              speechSynthesis.cancel()
              speechSynthesis.speak(new SpeechSynthesisUtterance(detected))
              setSignHistory(prev => [...prev.slice(-99), { word: detected, time: fmtTime(new Date()) }])
            }
          }
        } else {
          lastSignRef.current = detected
          holdCountRef.current = 0
        }
      }, 33)

      render()
    }

    function drawHand(ctx, landmarks, w, h) {
      CONNECTIONS.forEach(([a, b]) => {
        ctx.beginPath()
        ctx.moveTo((1 - landmarks[a].x) * w, landmarks[a].y * h)
        ctx.lineTo((1 - landmarks[b].x) * w, landmarks[b].y * h)
        ctx.strokeStyle = 'rgba(255,255,255,0.45)'
        ctx.lineWidth = 1.8
        ctx.stroke()
      })
      landmarks.forEach((pt, idx) => {
        const x   = (1 - pt.x) * w
        const y   = pt.y * h
        const tip = [4, 8, 12, 16, 20].includes(idx)
        ctx.beginPath()
        ctx.arc(x, y, tip ? 6 : 3.5, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(0,113,227,0.15)'
        ctx.fill()
        ctx.beginPath()
        ctx.arc(x, y, tip ? 3.5 : 2, 0, Math.PI * 2)
        ctx.fillStyle = tip ? '#0071E3' : '#ffffff'
        ctx.fill()
      })
    }

    function render() {
      const canvas = canvasRef.current
      const video  = videoRef.current
      if (!canvas || !video) return
      const rect = canvas.getBoundingClientRect()
      const rw = Math.round(rect.width)
      const rh = Math.round(rect.height)
      if (canvas.width !== rw)  canvas.width  = rw
      if (canvas.height !== rh) canvas.height = rh
      const ctx = canvas.getContext('2d')
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      smoothLandmarksRef.current = rawLandmarksRef.current.map((lm, i) =>
        smoothLandmarks(smoothLandmarksRef.current[i], lm)
      )
      smoothLandmarksRef.current.forEach(lm => drawHand(ctx, lm, canvas.width, canvas.height))
      animationId = requestAnimationFrame(render)
    }

    setup()
    return () => {
      cancelAnimationFrame(animationId)
      clearInterval(detectionInterval)
    }
  }, [started])

  function handleStart() {
    speechSynthesis.cancel()
    speechSynthesis.speak(new SpeechSynthesisUtterance(' '))
    setStarted(true)
  }

  return (
    // Canvas
    <div style={{
      height: '100%', width: '100%',
      background: C.canvas,
      padding: '18px',
      display: 'flex'
    }}>

      {/* Main card */}
      <div style={{
        flex: 1,
        background: C.card,
        borderRadius: '22px',
        boxShadow: '0 4px 30px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.04)',
        display: 'flex',
        overflow: 'hidden'
      }}>

        {/* ── LEFT — signs panel ── */}
        <aside style={{
          width: '320px', flexShrink: 0,
          background: C.card,
          borderRight: `1px solid ${C.divider}`,
          display: 'flex', flexDirection: 'column',
          minHeight: 0
        }}>

          {/* Brand */}
          <header style={{
            padding: '22px 22px 18px',
            display: 'flex', alignItems: 'center', gap: '10px'
          }}>
            <span style={{ fontSize: '1.35rem' }}>🤟</span>
            <span style={{
              color: C.text, fontWeight: '600', fontSize: '17px',
              letterSpacing: '-0.02em'
            }}>
              SignSpeak
            </span>
          </header>

          {/* Recent title */}
          <div style={{
            padding: '0 22px 8px',
            color: C.text3, fontSize: '11px', fontWeight: '600',
            letterSpacing: '0.06em', textTransform: 'uppercase'
          }}>
            Recent
          </div>

          {/* History list */}
          <div style={{
            flex: 1, minHeight: 0, overflowY: 'auto',
            padding: '0 14px 12px',
            display: 'flex', flexDirection: 'column', gap: '4px'
          }}>
            {signHistory.length === 0 ? (
              <div style={{
                color: C.text3, fontSize: '13px',
                textAlign: 'center', padding: '18px 12px',
                lineHeight: '1.5'
              }}>
                No signs yet.
              </div>
            ) : signHistory.slice().reverse().map((item, i) => (
              <div key={signHistory.length - i} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 14px',
                background: i === 0 ? C.accentBg : C.chip,
                borderRadius: '10px',
                transition: 'background 0.2s'
              }}>
                <span style={{
                  color: i === 0 ? C.accent : C.text,
                  fontWeight: '500', fontSize: '14px', letterSpacing: '-0.01em'
                }}>
                  {item.word}
                </span>
                <span style={{ color: C.text3, fontSize: '11px', fontVariantNumeric: 'tabular-nums' }}>
                  {item.time}
                </span>
              </div>
            ))}
          </div>

          {/* Signs reference */}
          <div style={{
            borderTop: `1px solid ${C.divider}`,
            padding: '16px 18px 18px'
          }}>
            <div style={{
              color: C.text3, fontSize: '11px', fontWeight: '600',
              letterSpacing: '0.06em', marginBottom: '12px',
              textTransform: 'uppercase'
            }}>
              Signs · hold to speak
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px' }}>
              {SIGN_GUIDE.map(({ sign: s, hint }) => {
                const active = sign === s
                return (
                  <div key={s} style={{
                    background: active ? C.accentBg : C.chip,
                    borderRadius: '10px',
                    padding: '8px 10px',
                    transition: 'all 0.18s',
                    outline: active ? `1px solid ${C.accent}` : '1px solid transparent'
                  }}>
                    <div style={{
                      color: active ? C.accent : C.text,
                      fontSize: '12px', fontWeight: '600',
                      letterSpacing: '-0.01em'
                    }}>
                      {s}
                    </div>
                    <div style={{ color: C.text3, fontSize: '10px', marginTop: '2px' }}>
                      {hint}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </aside>

        {/* ── RIGHT — video area ── */}
        <main style={{
          flex: 1, padding: '18px',
          display: 'flex', minHeight: 0
        }}>
          <div style={{
            flex: 1, position: 'relative',
            borderRadius: '16px', overflow: 'hidden',
            background: '#000',
            boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.05)'
          }}>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              style={{
                width: '100%', height: '100%',
                objectFit: 'cover', transform: 'scaleX(-1)', display: 'block'
              }}
            />
            <canvas
              ref={canvasRef}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
            />

            {/* Start overlay */}
            {!started && (
              <div onClick={handleStart} style={{
                position: 'absolute', inset: 0,
                background: 'rgba(0,0,0,0.55)',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', gap: '20px',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)'
              }}>
                <div style={{ fontSize: '3.4rem', filter: 'drop-shadow(0 4px 20px rgba(0,0,0,0.3))' }}>🤟</div>
                <div style={{
                  color: '#fff', fontSize: '28px', fontWeight: '600',
                  letterSpacing: '-0.02em'
                }}>
                  Ready to sign?
                </div>
                <div style={{
                  color: 'rgba(255,255,255,0.75)', fontSize: '14px',
                  marginTop: '-14px', letterSpacing: '-0.01em'
                }}>
                  Enable camera and voice to begin.
                </div>
                <button style={{
                  background: C.accent, color: '#fff',
                  fontSize: '15px', fontWeight: '500',
                  padding: '12px 28px', borderRadius: '980px',
                  border: 'none', cursor: 'pointer',
                  letterSpacing: '-0.01em',
                  boxShadow: '0 4px 20px rgba(0,113,227,0.35)'
                }}>
                  Get Started
                </button>
              </div>
            )}

            {/* Live subtitle (movie/Meet style) */}
            {sign && (
              <div style={{
                position: 'absolute',
                bottom: '32px', left: '50%',
                transform: 'translateX(-50%)',
                background: 'rgba(0,0,0,0.7)',
                color: '#fff',
                fontSize: '17px', fontWeight: '500',
                padding: '9px 20px',
                borderRadius: '8px',
                letterSpacing: '-0.01em',
                maxWidth: '80%',
                textAlign: 'center',
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
                fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif'
              }}>
                {sign}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
