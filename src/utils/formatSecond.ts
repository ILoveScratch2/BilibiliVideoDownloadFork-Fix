export const formatSecond = (duration: number) => {
  const hours = Math.floor(duration / 3600)
  const minus = Math.floor((duration - (hours * 3600)) / 60)
  const seconds = Math.floor(duration - (minus * 60) - (hours * 3600))
  return `${hours > 9 ? hours : '0' + hours}:${minus > 9 ? minus : '0' + minus}:${seconds > 9 ? seconds : '0' + seconds}`
}
