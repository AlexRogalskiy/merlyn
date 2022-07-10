import type { Transition } from '../transitions/Transition.js'
import type { Manifest, SceneData } from '../vite/core/data/manifest.js'
import { loader, getResources } from './resources.js'
import type { Scene } from 'excalibur'
import { Loader } from 'merlyn'

export let isTransitioning = false
export let isBooting = true

export class Router {
  scenes: Record<string, SceneData>
  engine: ex.Engine
  manifest: Manifest

  constructor(manifest: Manifest) {
    this.manifest = manifest
    this.engine = manifest.game
    this.scenes = {}

    Object.entries(manifest.scenes).forEach(([key, value]) => {
      this.scenes[key] = value

      if (value.isPreloaded) {
        this.preloadScene(key)
      }
    })

    this.engine.start(loader as any).then(() => {
      this.goToScene(
        manifest.bootScene,
        { transition: manifest.transition },
        true
      )
    })
  }

  async goToScene<Data = any>(
    name: string,
    options: {
      data?: Data | Promise<Data>
      transition?: Transition
      onActivate?: (scene: Scene) => void
    } = {},
    initial = false
  ) {
    const sceneData = this.scenes[name]
    let scene = this.engine.scenes[name] as Scene

    const isDataPromise = (data: any): data is () => Promise<any> =>
      typeof data === 'function'

    // check if scene exists
    if (!sceneData) {
      throw new Error(`No scene named ${name}`)
    }

    // play outro transition
    const transition = await this.executeTransition({
      isOutro: true,
      transition: options.transition,
      // if this is the initial loading screen, start transition
      // at the completed state of outro
      progress: initial ? 1 : 0,
    })

    if (this.sceneNeedsLoading(name) || isDataPromise(options.data)) {
      // if initial loading screen uses resources, load them
      if (initial && this.manifest.loadingSceneResources.length) {
        // create new loader so we don't include resources from other preloaded scenes
        const loader = new Loader()
        loader.addResources(this.manifest.loadingSceneResources)
        await loader.load()
      }

      this.engine.goToScene(this.getLoadingSceneKeyForScene(name))

      // carry transition instance into loading scene
      if (transition) {
        this.engine.add(transition)
      }
    }

    const data = isDataPromise(options.data)
      ? await options.data()
      : options.data

    scene = await this.preloadScene(name)
    isBooting = false

    scene.once('activate', () => {
      options.onActivate?.(scene)
    })
    this.engine.goToScene(name, data)

    // play intro transition
    await this.executeTransition({
      isOutro: false,
      transition: options.transition,
    })

    return scene
  }

  get currentScene() {
    return this.engine.currentScene
  }

  getSceneByName(key: string) {
    return this.engine.scenes[key]
  }

  getLoadingSceneKeyForScene(key: string) {
    const loadingScenes = Object.entries(this.scenes).find(
      ([loadingKey, value]) => {
        return (
          value.isLoadingScene &&
          key.split('/').length === loadingKey.split('/').length
        )
      }
    )

    return loadingScenes?.[0] ?? '_loading'
  }

  async preloadScene(name: string) {
    let scene = this.engine.scenes[name]
    if (this.sceneNeedsLoading(name)) {
      if (!scene) {
        scene = await this.loadSceneFile(name)
      }

      const newResources = getResources().filter((r) => !r.isLoaded())
      if (newResources.length > 0) {
        loader.addResources(newResources)

        const currentScene = this.engine.currentScene

        currentScene.onLoadStart?.()

        const onProgress = (progress) => {
          this.engine.currentScene.onLoad?.(progress)
        }

        loader.on('progress', onProgress)

        await loader.load()

        currentScene.onLoadComplete?.()
        loader.off('progress', onProgress)
      }
    }
    return scene
  }

  private sceneNeedsLoading(name: string) {
    if (!this.engine.scenes[name]) {
      return true
    }

    return this.resourcesNeedLoading()
  }

  private resourcesNeedLoading() {
    return getResources().filter((r) => !r.isLoaded()).length > 0
  }

  /**
   * Imports the scene file, instantiates the scene and adds it to the engine
   */
  private async loadSceneFile(name: string) {
    const sceneData = this.scenes[name]

    const Scene =
      sceneData.isPreloaded === false
        ? await sceneData.scene().then((r) => r.default)
        : sceneData.scene

    if (Scene) {
      const scene = new Scene()

      // @ts-ignore
      scene.name = name
      // scene.params = params
      this.engine.add(name, scene)
      return scene
    } else {
      throw new Error(`"${name}" does not export default a Scene class`)
    }
  }

  private async executeTransition({
    isOutro,
    transition,
    progress = 0,
  }: {
    isOutro: boolean
    transition?: Transition
    progress?: number
  }) {
    const scene = this.engine.currentScene

    if (transition) {
      isTransitioning = true
      scene.isTransitioning = true

      scene.engine.add(transition)

      if (isOutro) {
        scene.onOutroStart?.()
      } else {
        scene.onIntroStart?.()
      }

      transition.on('outro', (progress) => {
        scene.onOutro?.(progress as unknown as number)
      })

      transition.on('intro', (progress) => {
        scene.onIntro?.(progress as unknown as number)
      })

      // @ts-ignore
      await transition._execute(isOutro, progress)

      if (!isOutro) {
        scene.onIntroComplete?.()

        // transition is complete, remove it
        transition.kill()
      } else {
        scene.onOutroComplete?.()
      }

      scene.isTransitioning = false
      isTransitioning = false
    }

    return transition
  }
}
