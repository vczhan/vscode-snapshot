export function mapToObj(map) {
  return [...map.entries()].reduce((arr, [id, value]) => (arr.push({id, ...value}), arr), [])
}

export function mapToJson(map: Map<string, object>) {
  // return JSON.stringify(Object.fromEntries(map))
  return JSON.stringify(mapToObj(map))
}

export function jsonToMap(json: string) {
  // const obj = JSON.parse(json)
  // return new Map(Object.entries(obj))
  return JSON.parse(json).reduce((map, {id, ...rest}) => (map.set(id, rest), map), new Map)
}

// 时间格式化
export function formatTime(t, s) {
  //s YYYY-MM-DD hh:mm:ss
  //t new Date()
  t = new Date(t)
  var re = /YYYY|YY|MM|M|DD|D|hh|h|mm|m|ss|s/g
  return s.replace(re, function ($1) {
    switch ($1) {
      case 'YYYY': return t.getFullYear()
      case 'YY': return ('' + t.getFullYear()).slice(-2)
      case 'MM': return ('0' + (t.getMonth() + 1)).slice(-2)
      case 'M': return t.getMonth() + 1
      case 'DD': return ('0' + t.getDate()).slice(-2)
  case 'D': return t.getDate()
      case 'hh': return ('0' + t.getHours()).slice(-2)
      case 'h': return t.getHours()
      case 'mm': return ('0' + t.getMinutes()).slice(-2)
      case 'm': return t.getMinutes()
      case 'ss': return ('0' + t.getSeconds()).slice(-2)
      case 's': return t.getSeconds()
    }
    return $1
  })
}

// 克隆map对象
export function cloneMap(map) {
  return new Map(map)
}
