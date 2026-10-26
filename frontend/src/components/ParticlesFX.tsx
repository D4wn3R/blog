import Particles, { ParticlesProvider } from '@tsparticles/react'
import { loadSlim } from '@tsparticles/slim'
import type { ISourceOptions } from '@tsparticles/engine'
import { useReducedMotion } from 'motion/react'

// 星点连线背景（tsParticles slim 包）：青为主、品红点缀，呼应赛博色板；
// detectsOn: 'window' 让父层 pointer-events:none 不挡 hover 抓取交互
const OPTIONS: ISourceOptions = {
  fullScreen: { enable: false }, // 定位由外层 fixed 容器负责
  background: { color: { value: 'transparent' } },
  detectRetina: true,
  fpsLimit: 60,
  particles: {
    number: {
      value: 46,
      density: { enable: true, width: 900, height: 900 },
      limit: { mode: 'delete', value: 100 },
    },
    color: { value: ['#2ee6ff', '#2ee6ff', '#2ee6ff', '#ff2e88'] },
    shape: { type: 'circle' },
    opacity: {
      value: { min: 0.15, max: 0.5 },
      animation: { enable: true, speed: 0.7, sync: false }, // 星点呼吸闪烁
    },
    size: { value: { min: 0.6, max: 2.2 } },
    links: { enable: true, distance: 140, color: '#2ee6ff', opacity: 0.13, width: 1 },
    move: {
      enable: true,
      speed: 0.55,
      direction: 'none',
      random: true,
      straight: false,
      outModes: { default: 'out' },
    },
  },
  interactivity: {
    detectsOn: 'window',
    events: {
      onHover: { enable: true, mode: 'grab' }, // 光标附近点亮连线网
      resize: { enable: true },
    },
    modes: {
      grab: { distance: 170, links: { opacity: 0.32 } },
    },
  },
}

// 全局星点层：仅非文章详情页挂载（文章页保持静态背景保证可读性）；
// reduced-motion 下连引擎都不初始化，纯静态背景
export default function ParticlesFX() {
  const reduce = useReducedMotion()
  if (reduce) return null
  return (
    <ParticlesProvider init={loadSlim}>
      <Particles id="bg-particles" className="absolute inset-0" options={OPTIONS} />
    </ParticlesProvider>
  )
}
