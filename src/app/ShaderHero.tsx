'use client'
import { useEffect, useRef } from 'react'
import s from './page.module.css'

// 首屏全屏流体光影背景（WebGL 片元着色器，Unicorn Studio 同款气质）：
// 域扭曲 fBm 噪声随时间缓缓流动，配深紫/青/粉调色，跟随鼠标产生高光。横向铺满整屏，文案浮于其上。
// 渐进增强：WebGL 不可用 / reduced-motion 时不渲染（保留深色背景 + 既有极光），不影响显示。
const FRAG = `
precision highp float;
uniform vec2 u_res;
uniform float u_time;
uniform vec2 u_mouse;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453123); }
float noise(vec2 p){
  vec2 i=floor(p), f=fract(p);
  float a=hash(i), b=hash(i+vec2(1.,0.)), c=hash(i+vec2(0.,1.)), d=hash(i+vec2(1.,1.));
  vec2 u=f*f*(3.-2.*f);
  return mix(a,b,u.x)+(c-a)*u.y*(1.-u.x)+(d-b)*u.x*u.y;
}
float fbm(vec2 p){ float v=0.,a=0.5; for(int i=0;i<5;i++){ v+=a*noise(p); p*=2.0; a*=0.5; } return v; }
void main(){
  vec2 uv = gl_FragCoord.xy/u_res.xy;
  vec2 p = uv; p.x *= u_res.x/u_res.y;
  float t = u_time*0.045;
  vec2 q = vec2(fbm(p+vec2(0.0,t)), fbm(p+vec2(5.2,1.3)-t));
  vec2 r = vec2(fbm(p+3.6*q+vec2(1.7,9.2)+t*0.6), fbm(p+3.6*q+vec2(8.3,2.8)-t*0.4));
  float f = fbm(p+3.6*r);
  vec2 m = u_mouse; m.x *= u_res.x/u_res.y;
  float md = distance(p, m);
  float glow = smoothstep(0.55, 0.0, md);
  vec3 c1=vec3(0.035,0.027,0.070);
  vec3 c2=vec3(0.36,0.17,0.78);
  vec3 c3=vec3(0.09,0.62,0.82);
  vec3 c4=vec3(0.95,0.36,0.74);
  vec3 col=mix(c1,c2,smoothstep(0.15,0.72,f));
  col=mix(col,c3,smoothstep(0.55,1.0,f+0.18*r.x));
  col=mix(col,c4,smoothstep(0.62,1.0,length(q))*0.55);
  col += glow*vec3(0.45,0.32,0.95)*0.5;
  col *= smoothstep(1.35,0.25,distance(uv,vec2(0.5,0.45)));
  gl_FragColor=vec4(col,1.0);
}`
const VERT = `attribute vec2 a;void main(){ gl_Position=vec4(a,0.0,1.0); }`

export function ShaderHero() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power' })
    if (!gl) return

    const compile = (type: number, src: string): WebGLShader | null => {
      const sh = gl.createShader(type)
      if (!sh) return null
      gl.shaderSource(sh, src)
      gl.compileShader(sh)
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        console.warn('[shader]', gl.getShaderInfoLog(sh))
        return null
      }
      return sh
    }
    const vs = compile(gl.VERTEX_SHADER, VERT)
    const fs = compile(gl.FRAGMENT_SHADER, FRAG)
    if (!vs || !fs) return
    const prog = gl.createProgram()!
    gl.attachShader(prog, vs)
    gl.attachShader(prog, fs)
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return
    gl.useProgram(prog)

    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(prog, 'a')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
    const uRes = gl.getUniformLocation(prog, 'u_res')
    const uTime = gl.getUniformLocation(prog, 'u_time')
    const uMouse = gl.getUniformLocation(prog, 'u_mouse')

    const mouse = { x: 0.5, y: 0.55, tx: 0.5, ty: 0.55 }
    const dpr = Math.min(window.devicePixelRatio || 1, 1.6)
    const resize = (): void => {
      const w = canvas.clientWidth, h = canvas.clientHeight
      canvas.width = Math.max(1, Math.floor(w * dpr))
      canvas.height = Math.max(1, Math.floor(h * dpr))
      gl.viewport(0, 0, canvas.width, canvas.height)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    const onMove = (e: PointerEvent): void => {
      const r = canvas.getBoundingClientRect()
      mouse.tx = (e.clientX - r.left) / r.width
      mouse.ty = 1 - (e.clientY - r.top) / r.height
    }
    window.addEventListener('pointermove', onMove, { passive: true })

    let raf = 0
    const start = performance.now()
    const loop = (now: number): void => {
      mouse.x += (mouse.tx - mouse.x) * 0.06
      mouse.y += (mouse.ty - mouse.y) * 0.06
      gl.uniform2f(uRes, canvas.width, canvas.height)
      gl.uniform1f(uTime, (now - start) / 1000)
      gl.uniform2f(uMouse, mouse.x, mouse.y)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    const onVis = (): void => {
      if (document.hidden) { cancelAnimationFrame(raf); raf = 0 }
      else if (!raf) raf = requestAnimationFrame(loop)
    }
    document.addEventListener('visibilitychange', onVis)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener('pointermove', onMove)
      document.removeEventListener('visibilitychange', onVis)
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    }
  }, [])

  return (
    <div className={s.shaderHero} aria-hidden="true">
      <canvas ref={ref} className={s.shaderCanvas} />
      <div className={s.shaderOverlay} />
    </div>
  )
}
