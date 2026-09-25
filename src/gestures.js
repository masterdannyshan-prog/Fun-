function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function analyze(lm) {
  const palmW = dist(lm[5], lm[17])
  const iUp = lm[8].y  < lm[6].y
  const mUp = lm[12].y < lm[10].y
  const rUp = lm[16].y < lm[14].y
  const pUp = lm[20].y < lm[18].y
  const iStr = lm[8].y  < lm[5].y
  const mStr = lm[12].y < lm[9].y
  const rStr = lm[16].y < lm[13].y
  const pStr = lm[20].y < lm[17].y
  const i2m         = dist(lm[8],  lm[12]) / palmW
  const t2i         = dist(lm[4],  lm[8])  / palmW
  const thumbSpread = dist(lm[4],  lm[5])  / palmW
  const thumbUp     = (lm[2].y - lm[4].y) > palmW * 0.5
  return { iUp, mUp, rUp, pUp, iStr, mStr, rStr, pStr, i2m, t2i, thumbSpread, thumbUp }
}

export function getHandShape(lm) {
  const h = analyze(lm)
  const i = h.iUp, m = h.mUp, r = h.rUp, p = h.pUp
  const is = h.iStr, ms = h.mStr, rs = h.rStr, ps = h.pStr
  const allDown  = !i && !m && !r && !p
  const thumbOut = h.thumbSpread > 0.6

  if (allDown && h.thumbUp)                return 'THUMB_UP'
  if (allDown)                             return 'FIST'
  if (is && ms && rs && ps && thumbOut)   return 'OPEN'
  if (is && ms && rs && ps)               return 'FOUR'
  if (h.t2i < 0.3 && ms && rs && ps)     return 'OK'
  if (is && !m && !r && ps && thumbOut)   return 'ILY'
  if (is && ms && rs && !p)               return 'THREE'
  if (is && ms && !r && !p)               return 'TWO'
  if (is && !m && !r && !p && thumbOut)   return 'L'
  if (is && !m && !r && !p && !thumbOut)  return 'POINT'
  if (!i && !m && !r && p  && thumbOut)   return 'Y'
  return null
}

export function detectMotionSign() { return null }

export function detectStaticSign(lm) {
  const shape = getHandShape(lm)
  if (!shape) return null
  const h = analyze(lm)

  if (shape === 'OPEN')     return 'Hello'
  if (shape === 'FOUR')     return 'Wait'
  if (shape === 'FIST')     return 'Stop'
  if (shape === 'THUMB_UP') return 'Yes'
  if (shape === 'OK')       return 'OK'
  if (shape === 'ILY')      return 'I Love You'
  if (shape === 'POINT')    return 'You'
  if (shape === 'TWO' && h.i2m > 0.5)  return 'Peace'
  if (shape === 'TWO' && h.i2m < 0.35) return 'No'
  if (shape === 'THREE')    return 'Thank You'
  if (shape === 'L')        return 'Sorry'
  if (shape === 'Y')        return 'Please'
  return null
}
