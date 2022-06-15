import LottieView from "lottie-react-native";
import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  Image,
  StatusBar,
  StyleSheet,
  useWindowDimensions,
  View,
  ViewStyle,
} from "react-native";
import {
  AwesomeSliderProps,
  Slider,
  SliderThemeType,
} from "react-native-awesome-slider";
import type { PanGesture } from "react-native-gesture-handler";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import * as ScreenOrientation from "expo-screen-orientation";
import Animated, {
  cancelAnimation,
  runOnJS,
  useAnimatedProps,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AVPlaybackStatus, Video, VideoProps } from "expo-av";
import { Text } from "./components";
import { Ripple } from "./components/ripple";
import { TapControler } from "./components/index";
import { palette } from "./theme/palette";
import { bin, clamp, height, isIos, useRefs, width } from "./utils";
import { VideoLoader } from "./components";
import {
  formatTime,
  formatTimeToMins,
  secondToTime,
} from "./utils/video-utils";
import { ResizeMode } from "expo-av";

const VIDEO_DEFAULT_HEIGHT = width * (9 / 16);
const hitSlop = { left: 8, bottom: 8, right: 8, top: 8 };

const controlAnimteConfig = {
  duration: 200,
};
const AnimatedLottieView = Animated.createAnimatedComponent(LottieView);

export type ExpoAvPlayerProps = VideoProps & {
  showOnStart?: boolean;
  onEnterFullscreen?: () => void;
  onExitFullscreen?: () => void;
  controlTimeout?: number;
  videoDefaultHeight?: number;
  headerBarTitle?: string;
  onTapBack?: () => void;
  navigation?: any;
  autoPlay?: boolean;
  onToggleAutoPlay?: (state: boolean) => void;
  onTapMore?: () => void;
  doubleTapInterval?: number;
  theme?: SliderThemeType;
  onTapPause?: (paused: boolean) => void;
  sliderProps?: Omit<
    AwesomeSliderProps,
    "progress" | "minimumValue" | "maximumValue"
  >;
  videoHeight: Animated.SharedValue<number>;
  customAnimationStyle?: Animated.AnimateStyle<ViewStyle>;
  controlViewOpacityValue?: Animated.SharedValue<number>;
  onCustomPanGesture?: PanGesture;
  isFullScreen: Animated.SharedValue<boolean>;
  disableControl?: boolean;
  renderBackIcon?: () => JSX.Element;
  renderFullScreenBackIcon?: () => JSX.Element;
  renderMore?: () => JSX.Element;
  renderFullScreen?: () => JSX.Element;
};
export type ExpoAvPlayerRef = {
  /**
   * Check control view to see if it is displayed before playing
   */
  setPlay: () => void;
  /**
   * Check control view to see if it is displayed before pause
   */
  setPause: () => void;
  /**
   * toggle full screen
   */
  toggleFullSreen: (isFullScreen: boolean) => void;
  /**
   * toggle control opatity
   */
  toggleControlViewOpacity: (isShow: boolean) => void;
  /**
   * seek to progress
   */
  setSeekTo: (second: number) => void;
};

const ExpoAvPlayer = forwardRef<ExpoAvPlayerRef, ExpoAvPlayerProps>(
  (
    {
      resizeMode = ResizeMode.CONTAIN,
      showOnStart = true,
      source,
      style,
      onEnterFullscreen,
      onExitFullscreen,
      controlTimeout = 2000,
      videoDefaultHeight = VIDEO_DEFAULT_HEIGHT,
      headerBarTitle = "",
      onTapBack,
      navigation,
      autoPlay = false,
      onToggleAutoPlay,
      onTapMore,
      doubleTapInterval = 500,
      theme = {
        minimumTrackTintColor: palette.Main(1),
        maximumTrackTintColor: palette.B(0.6),
        cacheTrackTintColor: palette.G1(1),
        bubbleBackgroundColor: palette.B(0.8),
        disableMinTrackTintColor: palette.Main(1),
      },
      onTapPause,
      sliderProps,
      videoHeight,
      customAnimationStyle,
      onCustomPanGesture,
      isFullScreen,
      disableControl,
      renderBackIcon,
      renderMore,
      renderFullScreen,
      renderFullScreenBackIcon,
      ...rest
    },
    ref
  ) => {
    /**
     * hooks
     */

    const insets = useSafeAreaInsets();
    const dimensions = useWindowDimensions();

    const leftDoubleTapBoundary =
      dimensions.width / 2 - insets.left - insets.right - 80;

    const rightDoubleTapBoundary =
      dimensions.width - leftDoubleTapBoundary - insets.left - insets.right;

    const [isFullscreen, setIsFullscreen] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [loading, setIsLoading] = useState(false);
    const [showTimeRemaining, setShowTimeRemaining] = useState(true);
    const [allowAutoPlayVideo, setAllowAutoPlayVideo] = useState(autoPlay);

    useImperativeHandle(ref, () => ({
      setPlay: () => {
        "worklet";
        checkTapTakesEffect();
        play();
      },
      setPause: () => {
        "worklet";
        checkTapTakesEffect();
        pause();
      },
      toggleFullSreen: (isFullScrren: boolean) => {
        isFullScrren ? enterFullScreen() : exitFullScreen();
      },
      toggleControlViewOpacity: (isShow: boolean) => {
        "worklet";
        isShow ? showControlAnimation() : hideControlAnimation();
      },
      setSeekTo: (seconds: number) => {
        seekTo(seconds);
      },
    }));
    /**
     * refs
     */
    const player = useRef({
      duration: 0,
    });
    const videoPlayer = useRef<Video>(null);
    const mounted = useRef(false);
    const autoPlayAnimation = useSharedValue(autoPlay ? 1 : 0);
    const { rippleLeft, rippleRight } = useRefs();
    /**
     * reanimated value
     */
    const isLoadEnd = useSharedValue(false);
    const [paused, setPaused] = useState(false);

    const controlViewOpacity = useSharedValue(showOnStart ? 1 : 0);

    const autoPlayTextAnimation = useSharedValue(0);
    const doubleLeftOpacity = useSharedValue(0);
    const doubleRightOpacity = useSharedValue(0);

    const videoScale = useSharedValue(1);
    const videoTransY = useSharedValue(0);
    const panIsVertical = useSharedValue(false);

    const doubleTapIsAlive = useSharedValue(false);

    const max = useSharedValue(100);
    const min = useSharedValue(0);
    const isScrubbing = useSharedValue(false);
    const progress = useSharedValue(0);

    const defaultVideoStyle = useAnimatedStyle(() => {
      const fullVideoHeight = height - insets.left - insets.right;
      return {
        transform: [
          {
            scale: videoScale.value,
          },
          {
            translateY: videoTransY.value,
          },
        ],
        height: videoHeight.value,
        width: withTiming(isFullScreen.value ? fullVideoHeight : width, {
          duration: 60,
        }),
      };
    }, [videoHeight, videoScale, videoTransY, insets]);
    const videoStyle = customAnimationStyle
      ? customAnimationStyle
      : defaultVideoStyle;

    const bottomControlStyle = useAnimatedStyle(() => {
      return {
        transform: [
          {
            translateY: isFullScreen.value ? -42 : 0,
          },
        ],
      };
    });
    const topControlStyle = useAnimatedStyle(() => {
      return {
        transform: [
          {
            translateY: isFullScreen.value ? -42 : 0,
          },
        ],
        opacity: withTiming(bin(!isFullScreen.value)),
      };
    });
    const topFullscreenControlStyle = useAnimatedStyle(() => {
      return {
        opacity: withTiming(bin(isFullScreen.value)),
      };
    });

    const bottomSliderStyle = useAnimatedStyle(() => {
      return {
        opacity: withTiming(bin(!isFullScreen.value)),
      };
    });
    const fullScreenSliderStyle = useAnimatedStyle(() => {
      return {
        opacity: withTiming(bin(isFullScreen.value)),
      };
    });
    const controlViewStyles = useAnimatedStyle(() => {
      return {
        opacity: controlViewOpacity.value,
      };
    });

    const autoPlayTextStyle = useAnimatedStyle(() => {
      return {
        opacity: autoPlayTextAnimation.value,
      };
    });

    const getDoubleLeftStyle = useAnimatedStyle(() => {
      return {
        opacity: withTiming(doubleLeftOpacity.value),
      };
    });

    const getDoubleRightStyle = useAnimatedStyle(() => {
      return {
        opacity: withTiming(doubleRightOpacity.value),
      };
    });
    /**
     * useAnimatedProps
     */
    const playAnimated = useDerivedValue(() => {
      return paused ? 0.5 : 0;
    }, [paused]);

    const playAnimatedProps = useAnimatedProps(() => {
      return {
        progress: withTiming(playAnimated.value),
      };
    });
    const fullscreenAnimatedProps = useAnimatedProps(() => {
      return {
        progress: withTiming(isFullScreen.value ? 0.5 : 0),
      };
    });
    const autoPlayAnimatedProps = useAnimatedProps(() => {
      return {
        progress: withTiming(autoPlayAnimation.value, { duration: 600 }),
      };
    });
    /**
     * useEffect
     */

    useEffect(() => {
      mounted.current = true;
      StatusBar.setBarStyle("light-content");
      const unBeforeRemove = navigation?.addListener(
        "beforeRemove",
        (e: any) => {
          e?.preventDefault();
          if (isFullScreen.value) {
            toggleFullScreen();
          } else {
            navigation.dispatch(e.data.action);
          }
        }
      );
      return () => {
        mounted.current = false;
        clearControlTimeout();
        pause();
        unBeforeRemove && unBeforeRemove();
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /**
     * Set a timeout when the controls are shown
     * that hides them after a length of time.
     */
    const setControlTimeout = () => {
      "worklet";
      controlViewOpacity.value = withDelay(controlTimeout, withTiming(0));
    };

    /**
     * Clear the hide controls timeout.
     */
    const clearControlTimeout = () => {
      "worklet";
      cancelAnimation(controlViewOpacity);
    };

    /**
     * Reset the timer completely
     */
    const resetControlTimeout = () => {
      "worklet";
      clearControlTimeout();
      setControlTimeout();
    };

    /**
     * Animation to show controls
     * fade in.
     */
    const showControlAnimation = () => {
      "worklet";
      controlViewOpacity.value = withTiming(1, controlAnimteConfig);
      setControlTimeout();
    };
    /**
     * Animation to show controls
     * fade out.
     */
    const hideControlAnimation = () => {
      "worklet";
      controlViewOpacity.value = withTiming(0, controlAnimteConfig);
    };
    /**
     * check on tap icon
     * @returns bool
     */
    const checkTapTakesEffect = () => {
      "worklet";
      if (disableControl) {
        return false;
      }
      resetControlTimeout();
      if (controlViewOpacity.value === 0) {
        showControlAnimation();
        return false;
      }
      return true;
    };

    const seekByStep = (isBack = false) => {
      seekTo(currentTime - (isBack ? 10 : -10));
    };

    /**
     * Toggle player full screen state on <Video> component
     */
    const enterFullScreen = () => {
      onEnterFullscreen?.();
      StatusBar.setHidden(true, "fade");
      ScreenOrientation.lockAsync(
        ScreenOrientation.OrientationLock.LANDSCAPE_RIGHT
      );
      isFullScreen.value = true;
      videoHeight.value = width;
    };

    const exitFullScreen = () => {
      onExitFullscreen?.();
      StatusBar.setHidden(false, "fade");
      ScreenOrientation.lockAsync(
        ScreenOrientation.OrientationLock.PORTRAIT_UP
      );
      isFullScreen.value = false;
      videoHeight.value = videoDefaultHeight;
    };
    const toggleFullScreenOnJS = async () => {
      const orientation = await ScreenOrientation.getOrientationLockAsync();
      if (
        isFullScreen.value ||
        orientation !== ScreenOrientation.OrientationLock.PORTRAIT_UP
      ) {
        exitFullScreen();
        StatusBar.setHidden(false, "fade");
      } else {
        enterFullScreen();
        StatusBar.setHidden(true, "fade");
      }

      setIsFullscreen(!isFullscreen);
    };
    const toggleFullScreen = () => {
      "worklet";
      const status = checkTapTakesEffect();
      if (!status) {
        return;
      }
      runOnJS(toggleFullScreenOnJS)();
    };

    /**
     * on pan event
     */
    const defalutPanGesture = Gesture.Pan()
      .onStart(({ velocityY, velocityX }) => {
        panIsVertical.value = Math.abs(velocityY) > Math.abs(velocityX);
      })
      .onUpdate(({ translationY }) => {
        controlViewOpacity.value = withTiming(0, { duration: 100 });
        if (isFullScreen.value) {
          if (translationY > 0 && Math.abs(translationY) < 100) {
            videoScale.value = clamp(
              0.9,
              1 - Math.abs(translationY) * 0.008,
              1
            );
            videoTransY.value = translationY;
          }
        } else {
          if (translationY < 0 && Math.abs(translationY) < 40) {
            videoScale.value = Math.abs(translationY) * 0.012 + 1;
          }
        }
      })
      .onEnd(({ translationY }, success) => {
        if (!panIsVertical.value && !success) {
          return;
        }
        if (isFullScreen.value) {
          if (translationY >= 100) {
            runOnJS(exitFullScreen)();
          }
        } else {
          if (-translationY >= 40) {
            runOnJS(enterFullScreen)();
          }
        }
        videoTransY.value = 0;
        videoScale.value = withTiming(1);
      });

    const onPanGesture = onCustomPanGesture
      ? onCustomPanGesture
      : defalutPanGesture;

    const singleTapHandler = Gesture.Tap().onEnd((_event, success) => {
      if (disableControl) {
        return;
      }
      if (success) {
        if (controlViewOpacity.value === 0) {
          controlViewOpacity.value = withTiming(1, controlAnimteConfig);
          setControlTimeout();
        } else {
          controlViewOpacity.value = withTiming(0, controlAnimteConfig);
        }
      }
    });

    const doubleTapHandle = Gesture.Tap()
      .numberOfTaps(2)
      .maxDuration(doubleTapInterval)
      .onStart(({ x }) => {
        doubleTapIsAlive.value =
          x < leftDoubleTapBoundary && x > rightDoubleTapBoundary;
      })
      .onEnd(({ x, y, numberOfPointers }, success) => {
        if (success) {
          if (numberOfPointers !== 1) {
            return;
          }

          if (x < leftDoubleTapBoundary) {
            doubleLeftOpacity.value = 1;
            rippleLeft.current?.onPress({ x, y });
            runOnJS(seekByStep)(true);
            return;
          }

          if (x > rightDoubleTapBoundary) {
            doubleRightOpacity.value = 1;
            rippleRight.current?.onPress({
              x: x - rightDoubleTapBoundary,
              y,
            });
            runOnJS(seekByStep)(false);

            return;
          }
        }
      });
    /**
     * On toggle play
     * @returns
     */
    const togglePlayOnJS = () => {
      if (isLoadEnd.value) {
        onReplyVideo();
        isLoadEnd.value = false;
      }
      onTapPause?.(!paused);
      paused ? play() : pause();
    };
    const onPauseTapHandler = () => {
      "worklet";
      const status = checkTapTakesEffect();
      if (!status) {
        return;
      }
      runOnJS(togglePlayOnJS)();
    };
    /**
     * on tap back
     * @returns
     */
    const onBackTapHandlerOnJS = async () => {
      const orientation = await ScreenOrientation.getOrientationLockAsync();
      if (
        isFullScreen.value ||
        orientation !== ScreenOrientation.OrientationLock.PORTRAIT_UP
      ) {
        setIsFullscreen(false);
        exitFullScreen();
        StatusBar.setHidden(false, "fade");
      } else {
        onTapBack?.();
      }
    };
    const onBackTapHandler = () => {
      "worklet";
      const status = checkTapTakesEffect();
      if (!status) {
        return;
      }
      runOnJS(onBackTapHandlerOnJS)();
    };

    /**
     * When load starts we display a loading icon
     * and show the controls.
     */
    const onLoadStart = () => {
      setIsLoading(true);
    };

    /**
     * Toggle between showing time remaining or
     * video duration in the timer control
     */
    const toggleTimerOnJS = () => {
      setShowTimeRemaining(!showTimeRemaining);
    };
    const toggleTimer = () => {
      "worklet";
      const status = checkTapTakesEffect();
      if (!status) {
        return;
      }
      runOnJS(toggleTimerOnJS)();
    };

    const onTapSlider = () => {
      if (disableControl) {
        return;
      }
      if (controlViewOpacity.value === 0) {
        showControlAnimation();
      }
    };
    /**
     * Calculate the time to show in the timer area
     * based on if they want to see time remaining
     * or duration. Formatted to look as 00:00.
     */
    const calculateTime = () => {
      return showTimeRemaining
        ? `${formatTimeToMins(currentTime)}`
        : `-${formatTime({
            time: player.current.duration - currentTime,
            duration: player.current.duration,
          })}`;
    };
    /**
     * Seek to a time in the video.
     *
     * @param {float} time time to seek to in ms
     */
    const seekTo = (time: number = 0) => {
      setCurrentTime(time);

      videoPlayer.current?.setStatusAsync({
        positionMillis: time * 1000,
        shouldPlay: !paused,
      });
      isScrubbing.value = false;
    };
    const onLoad = (data: AVPlaybackStatus) => {
      if (data.isLoaded) {
        const seconds = (data?.durationMillis || 0) / 1000;
        player.current.duration = seconds;
        max.value = seconds;
        setIsLoading(false);
        setControlTimeout();
      }
    };

    const onPlaybackStatusUpdate = (e: AVPlaybackStatus) => {
      if (!e.isLoaded) return;
      if (!isScrubbing.value) {
        setCurrentTime(e.positionMillis / 1000);
        progress.value = e.positionMillis / 1000;
      }
    };
    /**
     * on replay video
     */
    const onReplyVideo = () => {
      seekTo(0);
      setCurrentTime(0);
      progress.value = 0;
    };

    /**
     * play the video
     */
    const play = () => {
      setPaused(false);
      videoPlayer.current?.playAsync();
    };

    /**
     * pause the video
     */
    const pause = () => {
      setPaused(true);

      videoPlayer.current?.pauseAsync();
    };
    /**
     * on toggle auto play mode
     * @returns
     */
    const toggleAutoPlayOnJS = () => {
      setAllowAutoPlayVideo(!allowAutoPlayVideo);
      onToggleAutoPlay?.(!allowAutoPlayVideo);
    };
    const toggleAutoPlay = () => {
      "worklet";
      const status = checkTapTakesEffect();
      if (!status) {
        return;
      }
      autoPlayAnimation.value = autoPlayAnimation.value === 0 ? 0.5 : 0;
      autoPlayTextAnimation.value = withTiming(1);
      autoPlayTextAnimation.value = withDelay(3000, withTiming(0));
      runOnJS(toggleAutoPlayOnJS)();
    };

    const onMoreTapHandler = () => {
      "worklet";
      const status = checkTapTakesEffect();
      if (!status) {
        return;
      }
      if (onTapMore) {
        runOnJS(onTapMore)();
      }
    };

    /**
     * Render the seekbar and attach its handlers
     */
    const onSlidingComplete = (val: number) => {
      seekTo(val);
    };
    const onSlidingStart = () => {
      clearControlTimeout();
    };
    const taps = Gesture.Exclusive(doubleTapHandle, singleTapHandler);
    const gesture = Gesture.Race(onPanGesture, taps);
    return (
      <>
        <StatusBar
          barStyle={"light-content"}
          translucent
          backgroundColor={"#000"}
        />
        <GestureDetector gesture={gesture}>
          <Animated.View style={[styles.container, videoStyle, style]}>
            <Video
              ref={videoPlayer}
              resizeMode={resizeMode}
              onLoadStart={onLoadStart}
              style={styles.video}
              source={source}
              onLoad={onLoad}
              shouldPlay={!paused}
              onPlaybackStatusUpdate={onPlaybackStatusUpdate}
              progressUpdateIntervalMillis={1000}
              {...rest}
            />
            <VideoLoader loading={loading} />
            <Animated.View style={StyleSheet.absoluteFillObject}>
              <Animated.View style={[styles.controlView, controlViewStyles]}>
                <Animated.View
                  hitSlop={hitSlop}
                  style={[
                    controlStyle.group,
                    styles.topControls,
                    topControlStyle,
                  ]}
                >
                  <View style={styles.back}>
                    {Boolean(onTapBack) && (
                      <TapControler onPress={onBackTapHandler}>
                        {renderBackIcon ? (
                          renderBackIcon()
                        ) : (
                          <Image
                            source={require("./assets/right_16.png")}
                            style={styles.back}
                          />
                        )}
                      </TapControler>
                    )}
                  </View>
                  <View style={controlStyle.line}>
                    {Boolean(onToggleAutoPlay) && (
                      <Animated.View
                        style={[controlStyle.autoPlayText, autoPlayTextStyle]}
                      >
                        <Text
                          tx={
                            allowAutoPlayVideo
                              ? "Autoplay is on"
                              : "Autoplay is off"
                          }
                          t4
                          color={"#fff"}
                        />
                      </Animated.View>
                    )}

                    {Boolean(onToggleAutoPlay) && (
                      <TapControler
                        onPress={toggleAutoPlay}
                        style={controlStyle.autoPlay}
                      >
                        <AnimatedLottieView
                          animatedProps={autoPlayAnimatedProps}
                          source={require("./assets/lottie-auto-play.json")}
                        />
                      </TapControler>
                    )}
                    {Boolean(onTapMore) && (
                      <TapControler onPress={onMoreTapHandler}>
                        <Image
                          source={require("./assets/more_24.png")}
                          style={styles.more}
                        />
                      </TapControler>
                    )}
                  </View>
                </Animated.View>
                <Animated.View
                  style={[
                    controlStyle.group,
                    styles.topControls,
                    styles.topFullscreenControls,
                    topFullscreenControlStyle,
                  ]}
                  pointerEvents={isFullscreen ? "auto" : "none"}
                >
                  <View style={controlStyle.line}>
                    {Boolean(onTapBack) && (
                      <TapControler onPress={onBackTapHandler}>
                        {renderFullScreenBackIcon ? (
                          renderFullScreenBackIcon()
                        ) : (
                          <Image
                            source={require("./assets/right_16.png")}
                            style={styles.back}
                          />
                        )}
                      </TapControler>
                    )}
                    <Text
                      tx={headerBarTitle}
                      h5
                      numberOfLines={1}
                      style={styles.headerBarTitle}
                      color={palette.W(1)}
                    />
                  </View>
                  <View style={controlStyle.line}>
                    {Boolean(onToggleAutoPlay) && (
                      <Animated.View
                        style={[controlStyle.autoPlayText, autoPlayTextStyle]}
                      >
                        <Text tx="自动播放已开启" t4 color={"#fff"} />
                      </Animated.View>
                    )}
                    {Boolean(onToggleAutoPlay) && (
                      <TapControler
                        onPress={toggleAutoPlay}
                        style={controlStyle.autoPlay}
                      >
                        <AnimatedLottieView
                          animatedProps={autoPlayAnimatedProps}
                          source={require("./assets/lottie-auto-play.json")}
                        />
                      </TapControler>
                    )}
                    {Boolean(onTapMore) && (
                      <TapControler onPress={onMoreTapHandler}>
                        {renderMore ? (
                          renderMore()
                        ) : (
                          <Image
                            source={require("./assets/more_24.png")}
                            style={styles.more}
                          />
                        )}
                      </TapControler>
                    )}
                  </View>
                </Animated.View>
                <View style={controlStyle.pauseView}>
                  <TapControler
                    onPress={onPauseTapHandler}
                    style={controlStyle.pause}
                  >
                    <AnimatedLottieView
                      animatedProps={playAnimatedProps}
                      source={require("./assets/lottie-play.json")}
                    />
                  </TapControler>
                </View>
                <Animated.View
                  style={[
                    controlStyle.group,
                    controlStyle.bottomControls,
                    bottomControlStyle,
                  ]}
                >
                  <View
                    style={[controlStyle.bottomControlGroup, controlStyle.row]}
                  >
                    <TapControler onPress={toggleTimer}>
                      <Text style={controlStyle.timerText}>
                        <Text
                          style={controlStyle.timerText}
                          color={palette.W(1)}
                          tx={calculateTime()}
                          t3
                        />
                        <Text
                          style={controlStyle.timerText}
                          color={palette.W(1)}
                          tx={` / ${formatTimeToMins(player.current.duration)}`}
                          t3
                        />
                      </Text>
                    </TapControler>
                    <TapControler
                      onPress={toggleFullScreen}
                      style={controlStyle.fullToggle}
                    >
                      {renderFullScreen ? (
                        renderFullScreen()
                      ) : (
                        <AnimatedLottieView
                          animatedProps={fullscreenAnimatedProps}
                          source={require("./assets/lottie-fullscreen.json")}
                        />
                      )}
                    </TapControler>
                  </View>
                  <Animated.View
                    style={[
                      {
                        width: height - 40,
                      },
                      fullScreenSliderStyle,
                    ]}
                  >
                    <Slider
                      theme={theme}
                      progress={progress}
                      onSlidingComplete={onSlidingComplete}
                      onSlidingStart={onSlidingStart}
                      minimumValue={min}
                      maximumValue={max}
                      isScrubbing={isScrubbing}
                      bubble={secondToTime}
                      disableTapEvent
                      onTap={onTapSlider}
                      thumbScaleValue={controlViewOpacity}
                      thumbWidth={8}
                      sliderHeight={2}
                      {...sliderProps}
                    />
                  </Animated.View>
                </Animated.View>
              </Animated.View>
              <Ripple
                ref={rippleLeft}
                onAnimationEnd={() => {
                  doubleLeftOpacity.value = 0;
                }}
                style={[controlStyle.doubleTap, controlStyle.leftDoubleTap]}
                containerStyle={[{ width: leftDoubleTapBoundary }]}
              >
                <Animated.View style={getDoubleLeftStyle}>
                  <LottieView
                    source={require("./assets/lottie-seek-back.json")}
                    autoPlay
                    loop
                    style={controlStyle.backStep}
                  />
                  <Text tx="10s" isCenter color={palette.W(1)} t5 />
                </Animated.View>
              </Ripple>

              <Ripple
                ref={rippleRight}
                onAnimationEnd={() => {
                  doubleRightOpacity.value = 0;
                }}
                style={[
                  controlStyle.doubleTap,
                  controlStyle.rightDoubleTapContainer,
                ]}
                containerStyle={[{ width: leftDoubleTapBoundary }]}
              >
                <Animated.View style={getDoubleRightStyle}>
                  <LottieView
                    source={require("./assets/lottie-seek-back.json")}
                    autoPlay
                    loop
                    style={[
                      controlStyle.backStep,
                      { transform: [{ rotate: "90deg" }] },
                    ]}
                  />
                  <Text tx="10s" isCenter color={palette.W(1)} t5 />
                </Animated.View>
              </Ripple>
              <Animated.View style={[styles.slider, bottomSliderStyle]}>
                <Slider
                  theme={theme}
                  progress={progress}
                  onSlidingComplete={onSlidingComplete}
                  onSlidingStart={onSlidingStart}
                  minimumValue={min}
                  maximumValue={max}
                  isScrubbing={isScrubbing}
                  bubble={(value: number) => {
                    return secondToTime(value);
                  }}
                  disableTapEvent
                  onTap={onTapSlider}
                  thumbScaleValue={controlViewOpacity}
                  thumbWidth={12}
                  sliderHeight={2}
                  {...sliderProps}
                />
              </Animated.View>
            </Animated.View>

            {isIos && (
              <View
                style={[styles.stopBackView, { left: -insets.left }]}
                pointerEvents={isFullscreen ? "auto" : "none"}
              />
            )}
          </Animated.View>
        </GestureDetector>
      </>
    );
  }
);

ExpoAvPlayer.displayName = "ExpoAvPlayer";
export default ExpoAvPlayer;

const styles = StyleSheet.create({
  controlView: {
    backgroundColor: "rgba(0,0,0,.6)",
    justifyContent: "center",
    overflow: "hidden",
    ...StyleSheet.absoluteFillObject,
  },
  headerBarTitle: {
    marginLeft: 20,
    maxWidth: height / 2,
  },
  slider: {
    width: width,
    zIndex: 1,
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
  },

  stopBackView: {
    height: "100%",
    position: "absolute",
    width: 40,
  },
  topControls: {
    flexDirection: "row",
    justifyContent: "space-between",
    position: "absolute",
    top: 12,
    width: "100%",
  },
  topFullscreenControls: {
    top: 32,
  },
  video: {
    width: "100%",
    height: "100%",
  },

  back: {
    width: 16,
    height: 16,
    zIndex: 100,
  },
  backLarge: {
    width: 24,
    height: 24,
  },
  more: {
    width: 24,
    height: 24,
  },
  container: {
    backgroundColor: palette.B(1),
    alignItems: "center",
    elevation: 10,
    justifyContent: "center",
    zIndex: 10,
  },
});

const controlStyle = StyleSheet.create({
  autoPlay: {
    height: 24,
    marginRight: 32,
    width: 24,
  },
  autoPlayText: {
    marginRight: 10,
  },
  bottomControlGroup: {
    justifyContent: "space-between",
    marginBottom: 10,
  },

  bottomControls: {
    bottom: 0,
    position: "absolute",
    width: "100%",
  },
  fullToggle: {
    height: 20,
    width: 20,
  },
  group: {
    paddingHorizontal: 20,
  },
  line: {
    alignItems: "center",
    flexDirection: "row",
  },
  pause: {
    height: 48,
    width: 48,
  },
  pauseView: {
    alignSelf: "center",
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
  },
  timerText: {
    textAlign: "right",
  },
  doubleTap: {
    position: "absolute",
    height: "100%",
    justifyContent: "center",
    alignContent: "center",
    alignItems: "center",
  },

  leftDoubleTap: {
    left: 0,
    borderTopRightRadius: width,
    borderBottomRightRadius: width,
  },

  rightDoubleTapContainer: {
    borderTopLeftRadius: width,
    borderBottomLeftRadius: width,
    right: 0,
  },
  backStep: {
    width: 40,
    height: 40,
  },
});
