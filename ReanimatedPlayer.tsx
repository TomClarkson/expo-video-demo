import React from "react";
// import VideoPlayer from "expo-reanimated-av-player";
import { useSharedValue } from "react-native-reanimated";
import { Dimensions } from "react-native";
import VideoPlayer from "./video-player/index";
import { ResizeMode } from "expo-av";

export const ReanimatedPlayer = () => {
  const { height, width } = Dimensions.get("window");
  const videoHeight = useSharedValue(height);
  const isFullScreen = useSharedValue(true);

  const source = require("./videos/risingToTheTop.mp4");

  // const source = {
  //   uri: "https://d23dyxeqlo5psv.cloudfront.net/big_buck_bunny.mp4",
  // };

  const VIDEO_DEFAULT_HEIGHT = height;

  return (
    <VideoPlayer
      source={source}
      headerBarTitle={`fullscreen title`}
      onToggleAutoPlay={(state: boolean) => {
        console.log(`onToggleAutoPlay state: ${state}`);
      }}
      videoDefaultHeight={VIDEO_DEFAULT_HEIGHT}
      videoHeight={videoHeight}
      resizeMode={ResizeMode.STRETCH}
      isFullScreen={isFullScreen}
      onTapBack={() => {
        console.log("onTapBack");
      }}
      onTapMore={() => {
        console.log("onTapMore");
      }}
      style={{ width: "100%" }}
    />
  );
};
