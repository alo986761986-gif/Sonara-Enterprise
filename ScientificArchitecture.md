# 🔬 Sonara Labs - Scientific Architecture & Empirical Protocol

**Component**: Scientific Evaluation & Statistical Rigor Framework  
**Role**: Methodology, Double-Blind Testing & Statistical Significance Standard  
**Role**: Chief Software Architect & Principal Scientific Auditor  
**Regime**: **SOFTWARE FREEZE** (Pure Architectural Specification)  
**Date**: 2026-08-01  

---

## 📌 1. Mission & Scientific Standards

The **Scientific Architecture** of Sonara Labs establishes the methodology for validating AI music quality improvements. In Sonara V7:
1. No claim of model superiority or LoRA quality improvement is accepted without **empirical double-blind testing**.
2. All benchmark conclusions must adhere to standard statistical decision thresholds ($p < 0.0001$, 95% Confidence Intervals).
3. Every empirical evaluation must be reproducible: tied to physical `.wav` files, deterministic random seeds, and cryptographic checksums in the Corpus Registry.

---

## 🧪 2. Double-Blind Pairwise Evaluation Protocol

```
+-----------------------------------------------------------------------------------+
|                        DOUBLE-BLIND EVALUATION PIPELINE                           |
+-----------------------------------------------------------------------------------+
|                                                                                   |
|  [Test Prompt P_i] ───►  Generator Model A (Baseline: ACE-Step Base)              |
|                     ───►  Generator Model B (Target: Deep House LoRA V1)          |
|                                                                                   |
|                                     │                                             |
|                                     ▼                                             |
|                       [Anonymized Audio Pair (X, Y)]                              |
|           (Track identity randomized; metadata stripped by Auditor)                |
|                                                                                   |
|                                     │                                             |
|                                     ▼                                             |
|                        [Blinded Music Critic / Listener]                          |
|                       Assigns Scores: Quality(X) vs Quality(Y)                    |
|                                                                                   |
|                                     │                                             |
|                                     ▼                                             |
|                        [Auditor Unblinding Engine]                                |
|                  Computes Delta = Score(Target) - Score(Baseline)                 |
+-----------------------------------------------------------------------------------+
```

### 2.1 Protocol Execution Rules
1. **Anonymization**: Evaluators (whether automated Music Critic instances or human audio engineers) receive audio clips labeled strictly as `Clip_X` and `Clip_Y`. Model identity, LoRA name, and seed provenance are hidden during scoring.
2. **Balanced Presentation**: The presentation order (Baseline first vs Target first) is randomized with 50/50 probability to eliminate order bias.
3. **Identical Generation Conditions**: Both models must synthesize audio using identical text prompts, target BPM, musical key, and sample rate.

---

## 📊 3. Statistical Testing & Decision Framework

### 3.1 Sample Size ($n$) Requirements
To achieve statistical power ($1 - \beta \ge 0.95$) at significance level $\alpha = 0.001$:
- Minimum evaluation sample size for genre-wide claims: $n \ge 1,000$ paired samples.
- Every sample $i \in \{1, \dots, n\}$ must correspond to a verified physical `audio.wav` file in `/dataset/`.

### 3.2 Paired Difference Metric
For each sample pair $i$, the quality difference is defined as:

$$ d_i = \text{Score}_{\text{Target}, i} - \text{Score}_{\text{Baseline}, i} $$

The sample mean difference $\bar{d}$ and sample standard deviation $s_d$ are computed as:

$$ \bar{d} = \frac{1}{n} \sum_{i=1}^{n} d_i, \quad s_d = \sqrt{\frac{1}{n-1} \sum_{i=1}^{n} (d_i - \bar{d})^2} $$

### 3.3 Confidence Interval (95% CI)
The 95% Confidence Interval for the mean quality improvement is calculated using the Student's $t$-distribution:

$$ \text{CI}_{95\%} = \left[ \bar{d} - t_{0.025, n-1} \frac{s_d}{\sqrt{n}}, \; \bar{d} + t_{0.025, n-1} \frac{s_d}{\sqrt{n}} \right] $$

### 3.4 Hypothesis Testing & $p$-Value Threshold
- **Null Hypothesis ($H_0$)**: $\mu_d \le 0$ (Target model offers no quality improvement over Baseline).
- **Alternative Hypothesis ($H_1$)**: $\mu_d > 0$ (Target model significantly outperforms Baseline).
- **Decision Threshold**: $H_0$ is rejected if and only if $p < 0.0001$ AND the lower bound of $\text{CI}_{95\%} > +5.0\text{ points}$.

---

## 🏆 4. Scientific Quality Classification Matrix

| Metric Parameter | Gold Standard Requirement | Silver Requirement | Discarded Threshold |
| :--- | :---: | :---: | :---: |
| **Overall Quality Score** | $\ge 95.0$ | $90.0 \le \text{Score} < 95.0$ | $< 90.0$ |
| **Integrated LUFS Target** | $-11.5 \pm 0.5 \text{ LUFS}$ | $-14.0 \pm 1.5 \text{ LUFS}$ | Outside range |
| **Stereo Width** | $0.85 - 0.98$ | $0.70 - 0.84$ | $< 0.70$ |
| **BPM Grid Alignment** | $\ge 0.98$ | $\ge 0.95$ | $< 0.95$ |
| **Physical Bundle Artifacts** | **8 / 8 files present** | $\ge 4 \text{ files}$ | Missing `audio.wav` |

---

## 📜 5. Reproducible Science & Open Data Charter
All scientific claims published by Sonara Labs must be accompanied by:
1. `validation_report.json` containing complete sample-by-sample $d_i$ distributions.
2. Master SHA256 checksums matching physical track bundles in `corpus_registry.json`.
3. Open-access parameter seeds enabling 100% deterministic re-generation of benchmark trials.
