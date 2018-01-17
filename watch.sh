#!/bin/bash

while true; do
  inotifywait -e create src/ && standard "--fix" && gulp ${1};
done;
