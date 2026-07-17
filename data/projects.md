# Projects

Edit this file to update the portfolio projects. Each project starts with `## Selected` or `## Other`, followed by a `### Project Title`.

Supported fields:
- `category`
- `url`
- `action`
- `award`
- `tags`

The description is the plain text below the fields.

## Selected

### Physics-Based Snow Simulation for Event-Camera De-Snowing
category: Computer Vision
tags: Event Cameras, Simulation, Autonomous Driving

Physics-based snow simulation pipeline for event-camera perception in autonomous driving. Snowfall is simulated as ego-motion-aligned particle dynamics rendered at 1250 fps, converted to events via v2e, and merged with real DSEC driving streams, yielding paired snowy/clean data with exact ground truth. Training on the simulated snow restores segmentation to near clear-weather level and improves object detection by 26% relative mAP.

### World Model
category: Robot Learning
tags: Robot Learning, World Models

Project details coming soon.

### Visual Odometry Pipeline
category: Computer Vision
award: Best Project Award
url: https://github.com/julianwinking/visual-odometry-pipeline
action: Open Repository
tags: Visual SLAM, Bundle Adjustment, Python

Full monocular visual odometry system featuring sliding-window Bundle Adjustment and Loop Closure with Pose Graph Optimization. Implements KLT tracking and 5-point/P3P-RANSAC algorithms for robust trajectory estimation.

### Satellite Docking
category: Non-Convex Optimization
url: https://github.com/julianwinking/satellite-docking
action: Open Repository
tags: SCvx, Trajectory Optimization, Python

Autonomous satellite docking using Sequential Convex Programming (SCvx) for trajectory optimization. Simulates dynamic environments and enforces safety constraints to ensure precise and collision-free docking maneuvers.

### Multi-Agent Goal Collection
category: Multi-Agent Path Planning
url: https://github.com/julianwinking/multi-agent-goal-collection
action: Open Repository
tags: VRP, Space-Time Planning, Python

Hierarchical coordination system for differential-drive fleets solving the Vehicle Routing Problem. Combines MILP-based task assignment with space-time reservation maps for collision-free trajectory planning.

### Reducing the Influence of Model Mismatch in Bayesian Optimization Through Targeted Noise Injection
category: Bachelor Thesis
url: https://github.com/julianwinking/bachelor-thesis
action: Open Repository
tags: Gaussian Processes, Bayesian Optimization, Probabilistic AI

Bachelor Thesis at the Institute of Data Science in Mechanical Engineering (RWTH Aachen). Addressed model mismatch in Bayesian Optimization by introducing "Targeted Noise Injection," a data-centric strategy utilizing a novel multiplicative Gaussian likelihood to selectively down-weight misleading observations.

## Other

### Flappy Bird
url: https://github.com/julianwinking/dpoc-flappy-bird

Dynamic Programming and Optimal Control solution for the Flappy Bird game.

### PID Controller Simulation Demo
url: projects/pid-demo/index.html

Browser-based control systems demo for tuning PID gains and observing system response.

### GymTracker
url: https://data-science-club.de/gym-tracker/

Predictive web app forecasting university gym occupancy using real-time data and time-series analysis.

### Banner Injector Extension
url: https://github.com/julianwinking/chrome-banner-injector

Chrome extension to inject custom banners into pages using JavaScript and CSS.

### RWTH Notenstreicher
url: https://rwth-notenstreicher.streamlit.app/

Streamlit app that analyses transcripts and suggests module exclusions to maximise GPA.
