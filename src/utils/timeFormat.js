/**
 * 时间格式化工具 (Time Formatter)
 * 解决后端服务器处于不同国家/时区（如美国），导致前端显示时差的问题。
 */

// 设置后端服务器所在的时区偏移量（单位：小时）。
// 例如：
// - 如果后端存的/返回的是 UTC 时间，则设置为 0
// - 如果后端存的是美国东部时间 (EST/EDT)，一般为 -5
// - 如果后端存的是美国太平洋时间 (PST/PDT)，一般为 -8
// 现代应用推荐后端统一返回 UTC 格式 (如 2024-05-10T12:00:00Z)，前端就无需配置偏移量，浏览器会自动转成本地时区。
const BACKEND_TIMEZONE_OFFSET = 0; // 【请根据后端实际时区修改此值，如果你发现时间还是不对，请调整这个偏移量】

/**
 * 将后端返回的时间格式化为客户端本地时间
 * 浏览器自带原生 API 可以直接获取当前用户的本地时区（无需通过 IP 检测，更准更快）
 *
 * @param {string|number|Date} rawTime 后端返回的时间 (例如 "2024-05-10 12:00:00", 或时间戳)
 * @returns {string} 转换后的本地时间字符串 (例如 "2024-05-10 20:00:00")
 */
export function formatLocalTime(rawTime) {
  if (!rawTime) return '—';

  let date;

  try {
    if (typeof rawTime === 'string') {
      // 兼容部分格式并处理
      let timeStr = rawTime.replace(' ', 'T');

      // 如果后端字符串没有时区标识（没有 'Z' 结尾，也没有 '+08:00' 等），
      // 我们需要根据后端时区，人为地给它补上时区信息，让浏览器知道它原本是哪个时区的时间。
      if (!timeStr.includes('Z') && !timeStr.match(/[+\-]\d{2}:\d{2}$/)) {
        if (BACKEND_TIMEZONE_OFFSET === 0) {
          timeStr += 'Z'; // UTC 时间
        } else {
          // 拼装例如 -05:00 或 +08:00
          const sign = BACKEND_TIMEZONE_OFFSET >= 0 ? '+' : '-';
          const offsetHours = String(Math.abs(BACKEND_TIMEZONE_OFFSET)).padStart(2, '0');
          timeStr += `${sign}${offsetHours}:00`;
        }
      }
      date = new Date(timeStr);
    } else {
      date = new Date(rawTime);
    }

    if (isNaN(date.getTime())) {
      return rawTime; // 解析失败则返回原值
    }

    // 格式化为当前浏览器的本地时区时间，这里强制 zh-CN 语言包以实现 YYYY-MM-DD HH:mm:ss 的格式
    const formatted = date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false // 24小时制
    });

    // 部分浏览器 toLocaleString('zh-CN') 返回的是 "2024/05/10 12:00:00"，转成短横线分隔
    return formatted.replace(/\//g, '-');
  } catch (err) {
    return rawTime;
  }
}
