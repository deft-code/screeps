#!/bin/bash

while true; do
  inotifywait -e create src/ && gulp ${1};
done;
