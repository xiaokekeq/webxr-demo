把你自己的环境图放到这个 assets 目录里。

两种用法：

1. 单张全景图模式
- 放到：assets/panorama/environment.jpg
- 要求：尽量使用 2:1 的 360 全景图，例如 4096x2048
- 然后确认 custom_environment_ar/index.html 里的 ENV_CONFIG.mode = 'panorama'

2. 六张 cubemap 模式
- 放到：assets/cubemap/
- 文件名必须是：
  px.jpg
  nx.jpg
  py.jpg
  ny.jpg
  pz.jpg
  nz.jpg
- 然后确认 custom_environment_ar/index.html 里的 ENV_CONFIG.mode = 'cubemap'

提示：
- 普通单张照片也能试，但反射通常不真实。
- 最适合的是 360 全景图或标准 cubemap。
