# 交接包F01参考答案（工程演示，非业务结论）

状态：已计算，待专业审阅

研究主题：dbb1fdfe-1773-4eec-bd9d-257306f9ee34

版本：32ca80bd-bf5d-482e-842b-ad4f8232dac1；父版本：无

方法：优劣解距离法 TOPSIS；引擎：1.1.0；参数版本：cfg-ed7ec7149bfe58ce

## 结果与诊断

得分仅用于本次给定对象的相对比较；不代表绝对水平。赋权方法页的排序为TOPSIS辅助预览。

逐项权重±20%后重新归一化；这是局部权重稳健性，不是统计显著性。

九点扫描为偏好区间检验，与逐项±20%局部敏感性分别保存；不代表输入误差、模型不确定性或统计显著性。

排序依赖样本、标准化和偏好；必须进行敏感性分析

```json
{
  "engineVersion": "1.1.0",
  "method": "topsis",
  "result": {
    "weights": [
      0.4,
      0.6
    ],
    "weightMethod": "manual",
    "normalization": "按列min–max；逆向指标反转；恒定列归零；TOPSIS对标准化矩阵加权后计算欧氏距离",
    "ranking": [
      {
        "label": "C",
        "score": 1,
        "rank": 1,
        "tied": false
      },
      {
        "label": "B",
        "score": 0.5,
        "rank": 2,
        "tied": false
      },
      {
        "label": "A",
        "score": 0,
        "rank": 3,
        "tied": false
      }
    ],
    "normalized": [
      [
        0,
        0
      ],
      [
        0.5,
        0.5
      ],
      [
        1,
        1
      ]
    ],
    "comparison": [
      {
        "method": "weighted",
        "ranking": [
          {
            "label": "C",
            "score": 1,
            "rank": 1,
            "tied": false
          },
          {
            "label": "B",
            "score": 0.5,
            "rank": 2,
            "tied": false
          },
          {
            "label": "A",
            "score": 0,
            "rank": 3,
            "tied": false
          }
        ]
      },
      {
        "method": "topsis",
        "ranking": [
          {
            "label": "C",
            "score": 1,
            "rank": 1,
            "tied": false
          },
          {
            "label": "B",
            "score": 0.5,
            "rank": 2,
            "tied": false
          },
          {
            "label": "A",
            "score": 0,
            "rank": 3,
            "tied": false
          }
        ]
      }
    ],
    "perturbations": [
      {
        "indicator": "演示收益",
        "multiplier": 0.8,
        "weights": [
          0.3478260869565218,
          0.6521739130434782
        ],
        "scores": [
          0,
          0.5,
          1
        ],
        "leaders": [
          "C"
        ],
        "ranking": [
          {
            "label": "C",
            "score": 1
          },
          {
            "label": "B",
            "score": 0.5
          },
          {
            "label": "A",
            "score": 0
          }
        ]
      },
      {
        "indicator": "演示收益",
        "multiplier": 1.2,
        "weights": [
          0.4444444444444444,
          0.5555555555555555
        ],
        "scores": [
          0,
          0.5,
          1
        ],
        "leaders": [
          "C"
        ],
        "ranking": [
          {
            "label": "C",
            "score": 1
          },
          {
            "label": "B",
            "score": 0.5
          },
          {
            "label": "A",
            "score": 0
          }
        ]
      },
      {
        "indicator": "演示成本",
        "multiplier": 0.8,
        "weights": [
          0.4545454545454546,
          0.5454545454545454
        ],
        "scores": [
          0,
          0.5,
          1
        ],
        "leaders": [
          "C"
        ],
        "ranking": [
          {
            "label": "C",
            "score": 1
          },
          {
            "label": "B",
            "score": 0.5
          },
          {
            "label": "A",
            "score": 0
          }
        ]
      },
      {
        "indicator": "演示成本",
        "multiplier": 1.2,
        "weights": [
          0.35714285714285715,
          0.6428571428571428
        ],
        "scores": [
          0,
          0.5,
          1
        ],
        "leaders": [
          "C"
        ],
        "ranking": [
          {
            "label": "C",
            "score": 1
          },
          {
            "label": "B",
            "score": 0.5
          },
          {
            "label": "A",
            "score": 0
          }
        ]
      }
    ],
    "scan": {
      "type": "nine-point",
      "indicatorIndex": 0,
      "range": [
        0.1,
        0.9
      ],
      "step": 0.1,
      "seed": null,
      "remainingWeightRule": "其余指标保持原相对比例",
      "scoring": "topsis",
      "points": [
        {
          "value": 0.1,
          "weights": [
            0.1,
            0.9
          ],
          "ranking": [
            {
              "label": "C",
              "score": 1
            },
            {
              "label": "B",
              "score": 0.5
            },
            {
              "label": "A",
              "score": 0
            }
          ]
        },
        {
          "value": 0.2,
          "weights": [
            0.2,
            0.8
          ],
          "ranking": [
            {
              "label": "C",
              "score": 1
            },
            {
              "label": "B",
              "score": 0.5
            },
            {
              "label": "A",
              "score": 0
            }
          ]
        },
        {
          "value": 0.3,
          "weights": [
            0.3,
            0.7
          ],
          "ranking": [
            {
              "label": "C",
              "score": 1
            },
            {
              "label": "B",
              "score": 0.5
            },
            {
              "label": "A",
              "score": 0
            }
          ]
        },
        {
          "value": 0.4,
          "weights": [
            0.4,
            0.6
          ],
          "ranking": [
            {
              "label": "C",
              "score": 1
            },
            {
              "label": "B",
              "score": 0.5
            },
            {
              "label": "A",
              "score": 0
            }
          ]
        },
        {
          "value": 0.5,
          "weights": [
            0.5,
            0.5
          ],
          "ranking": [
            {
              "label": "C",
              "score": 1
            },
            {
              "label": "B",
              "score": 0.5
            },
            {
              "label": "A",
              "score": 0
            }
          ]
        },
        {
          "value": 0.6,
          "weights": [
            0.6,
            0.4
          ],
          "ranking": [
            {
              "label": "C",
              "score": 1
            },
            {
              "label": "B",
              "score": 0.5
            },
            {
              "label": "A",
              "score": 0
            }
          ]
        },
        {
          "value": 0.7,
          "weights": [
            0.7,
            0.30000000000000004
          ],
          "ranking": [
            {
              "label": "C",
              "score": 1
            },
            {
              "label": "B",
              "score": 0.5
            },
            {
              "label": "A",
              "score": 0
            }
          ]
        },
        {
          "value": 0.8,
          "weights": [
            0.8,
            0.19999999999999996
          ],
          "ranking": [
            {
              "label": "C",
              "score": 1
            },
            {
              "label": "B",
              "score": 0.5
            },
            {
              "label": "A",
              "score": 0
            }
          ]
        },
        {
          "value": 0.9,
          "weights": [
            0.9,
            0.09999999999999998
          ],
          "ranking": [
            {
              "label": "C",
              "score": 1
            },
            {
              "label": "B",
              "score": 0.5
            },
            {
              "label": "A",
              "score": 0
            }
          ]
        }
      ]
    }
  },
  "notes": [
    "得分仅用于本次给定对象的相对比较；不代表绝对水平。赋权方法页的排序为TOPSIS辅助预览。",
    "逐项权重±20%后重新归一化；这是局部权重稳健性，不是统计显著性。",
    "九点扫描为偏好区间检验，与逐项±20%局部敏感性分别保存；不代表输入误差、模型不确定性或统计显著性。"
  ]
}
```

## 冻结输入、来源、配置与版本差异

以下完整快照用于复现；来源核定属于研究人员声明。

```json
{
  "id": "32ca80bd-bf5d-482e-842b-ad4f8232dac1",
  "versionId": "32ca80bd-bf5d-482e-842b-ad4f8232dac1",
  "studyId": "dbb1fdfe-1773-4eec-bd9d-257306f9ee34",
  "parentId": null,
  "parentVersionId": null,
  "title": "交接包F01参考答案（工程演示，非业务结论）",
  "kind": "strategic-quantitative-study",
  "schemaVersion": 2,
  "status": "已计算，待专业审阅",
  "createdAt": "2026-10-17T16:16:04.092Z",
  "taskType": "evaluation",
  "templateId": null,
  "method": {
    "id": "topsis",
    "name": "优劣解距离法 TOPSIS",
    "family": "综合评价与排序",
    "caution": "排序依赖样本、标准化和偏好；必须进行敏感性分析"
  },
  "methodCatalogVersion": "1.0.0",
  "engineVersion": "1.1.0",
  "parameterVersion": "cfg-ed7ec7149bfe58ce",
  "parameters": {
    "facts": {
      "parameterClass": "fact",
      "snapshotRef": "inputSnapshot",
      "numericInputHash": "aae52e3ccf84984542957c1932ee6399811312f67cc3772800889fbfc4e82279"
    },
    "preferences": {
      "parameterClass": "preference",
      "weights": [
        0.4,
        0.6
      ],
      "weightMethod": "manual",
      "author": "工程验收",
      "reason": "交接包F01的固定工程权重，单一判断样本"
    },
    "scenarios": {
      "parameterClass": "scenario",
      "reason": "交接包F01的固定工程权重，单一判断样本"
    },
    "decisions": {
      "parameterClass": "decision",
      "engineStatus": "planned"
    },
    "constraints": {
      "parameterClass": "constraint",
      "configuration": {
        "functionalUnit": "",
        "systemBoundary": "",
        "baseYear": "",
        "population": "",
        "currencyBasis": "",
        "normalization": "min-max-v1",
        "period": "2025"
      },
      "checks": [
        {
          "id": "constraint-3eefae70-49d9-43e1-8d1c-3c397f9fab4d",
          "objectId": "3eefae70-49d9-43e1-8d1c-3c397f9fab4d",
          "status": "pass",
          "reason": "工程固定样本，未评估业务场地"
        },
        {
          "id": "constraint-2192fe3d-5c04-4581-b445-7358f6367d9e",
          "objectId": "2192fe3d-5c04-4581-b445-7358f6367d9e",
          "status": "pass",
          "reason": "工程固定样本，未评估业务场地"
        },
        {
          "id": "constraint-ad67fdfc-6e91-42fe-8b63-f96599fdab95",
          "objectId": "ad67fdfc-6e91-42fe-8b63-f96599fdab95",
          "status": "pass",
          "reason": "工程固定样本，未评估业务场地"
        }
      ]
    },
    "output": {
      "parameterClass": "output",
      "resultRef": "calculation.result",
      "readonly": true
    }
  },
  "normalization": "按列min–max；逆向指标反转；恒定列归零；TOPSIS对标准化矩阵加权后计算欧氏距离",
  "configuration": {
    "functionalUnit": "",
    "systemBoundary": "",
    "baseYear": "",
    "population": "",
    "currencyBasis": "",
    "normalization": "min-max-v1",
    "period": "2025"
  },
  "constraints": [
    {
      "id": "constraint-3eefae70-49d9-43e1-8d1c-3c397f9fab4d",
      "objectId": "3eefae70-49d9-43e1-8d1c-3c397f9fab4d",
      "status": "pass",
      "reason": "工程固定样本，未评估业务场地"
    },
    {
      "id": "constraint-2192fe3d-5c04-4581-b445-7358f6367d9e",
      "objectId": "2192fe3d-5c04-4581-b445-7358f6367d9e",
      "status": "pass",
      "reason": "工程固定样本，未评估业务场地"
    },
    {
      "id": "constraint-ad67fdfc-6e91-42fe-8b63-f96599fdab95",
      "objectId": "ad67fdfc-6e91-42fe-8b63-f96599fdab95",
      "status": "pass",
      "reason": "工程固定样本，未评估业务场地"
    }
  ],
  "review": {
    "comparable": true,
    "constraintsConfirmed": true,
    "declaredBy": "authenticated-researcher",
    "declaredAt": "2026-10-17T16:16:04.092Z",
    "confirmed": true
  },
  "input": {
    "matrix": [
      [
        1,
        9
      ],
      [
        5,
        5
      ],
      [
        9,
        1
      ]
    ],
    "labels": [
      "A",
      "B",
      "C"
    ],
    "objectIds": [
      "3eefae70-49d9-43e1-8d1c-3c397f9fab4d",
      "2192fe3d-5c04-4581-b445-7358f6367d9e",
      "ad67fdfc-6e91-42fe-8b63-f96599fdab95"
    ],
    "indicators": [
      {
        "indicatorId": "5fd4c190-2370-4e23-a64e-cfd713887c2d",
        "name": "演示收益",
        "unit": "演示单位",
        "nature": "demo",
        "definition": "",
        "frequency": "",
        "comparableScope": ""
      },
      {
        "indicatorId": "b1facbcc-26e2-4d88-a6b9-dee7c06a2d03",
        "name": "演示成本",
        "unit": "演示单位",
        "nature": "demo",
        "definition": "",
        "frequency": "",
        "comparableScope": ""
      }
    ],
    "directions": [
      "benefit",
      "cost"
    ],
    "weightMethod": "manual",
    "weights": [
      0.4,
      0.6
    ],
    "cellEvidence": [
      {
        "sourceRef": "交接包固定工程样本F01；不是业务事实",
        "period": "2025",
        "nature": "demo",
        "reviewStatus": "verified",
        "quote": "",
        "page": "",
        "reviewedBy": "工程验收",
        "reviewedAt": "2026-10-17T16:16:03.706Z",
        "objectId": "3eefae70-49d9-43e1-8d1c-3c397f9fab4d",
        "indicatorId": "5fd4c190-2370-4e23-a64e-cfd713887c2d",
        "value": 1
      },
      {
        "sourceRef": "交接包固定工程样本F01；不是业务事实",
        "period": "2025",
        "nature": "demo",
        "reviewStatus": "verified",
        "quote": "",
        "page": "",
        "reviewedBy": "工程验收",
        "reviewedAt": "2026-10-17T16:16:03.706Z",
        "objectId": "3eefae70-49d9-43e1-8d1c-3c397f9fab4d",
        "indicatorId": "b1facbcc-26e2-4d88-a6b9-dee7c06a2d03",
        "value": 9
      },
      {
        "sourceRef": "交接包固定工程样本F01；不是业务事实",
        "period": "2025",
        "nature": "demo",
        "reviewStatus": "verified",
        "quote": "",
        "page": "",
        "reviewedBy": "工程验收",
        "reviewedAt": "2026-10-17T16:16:03.706Z",
        "objectId": "2192fe3d-5c04-4581-b445-7358f6367d9e",
        "indicatorId": "5fd4c190-2370-4e23-a64e-cfd713887c2d",
        "value": 5
      },
      {
        "sourceRef": "交接包固定工程样本F01；不是业务事实",
        "period": "2025",
        "nature": "demo",
        "reviewStatus": "verified",
        "quote": "",
        "page": "",
        "reviewedBy": "工程验收",
        "reviewedAt": "2026-10-17T16:16:03.706Z",
        "objectId": "2192fe3d-5c04-4581-b445-7358f6367d9e",
        "indicatorId": "b1facbcc-26e2-4d88-a6b9-dee7c06a2d03",
        "value": 5
      },
      {
        "sourceRef": "交接包固定工程样本F01；不是业务事实",
        "period": "2025",
        "nature": "demo",
        "reviewStatus": "verified",
        "quote": "",
        "page": "",
        "reviewedBy": "工程验收",
        "reviewedAt": "2026-10-17T16:16:03.706Z",
        "objectId": "ad67fdfc-6e91-42fe-8b63-f96599fdab95",
        "indicatorId": "5fd4c190-2370-4e23-a64e-cfd713887c2d",
        "value": 9
      },
      {
        "sourceRef": "交接包固定工程样本F01；不是业务事实",
        "period": "2025",
        "nature": "demo",
        "reviewStatus": "verified",
        "quote": "",
        "page": "",
        "reviewedBy": "工程验收",
        "reviewedAt": "2026-10-17T16:16:03.706Z",
        "objectId": "ad67fdfc-6e91-42fe-8b63-f96599fdab95",
        "indicatorId": "b1facbcc-26e2-4d88-a6b9-dee7c06a2d03",
        "value": 1
      }
    ],
    "scan": {
      "type": "nine-point",
      "indicatorIndex": 0
    }
  },
  "inputSnapshot": {
    "matrix": [
      [
        1,
        9
      ],
      [
        5,
        5
      ],
      [
        9,
        1
      ]
    ],
    "labels": [
      "A",
      "B",
      "C"
    ],
    "objectIds": [
      "3eefae70-49d9-43e1-8d1c-3c397f9fab4d",
      "2192fe3d-5c04-4581-b445-7358f6367d9e",
      "ad67fdfc-6e91-42fe-8b63-f96599fdab95"
    ],
    "indicators": [
      {
        "indicatorId": "5fd4c190-2370-4e23-a64e-cfd713887c2d",
        "name": "演示收益",
        "unit": "演示单位",
        "nature": "demo",
        "definition": "",
        "frequency": "",
        "comparableScope": ""
      },
      {
        "indicatorId": "b1facbcc-26e2-4d88-a6b9-dee7c06a2d03",
        "name": "演示成本",
        "unit": "演示单位",
        "nature": "demo",
        "definition": "",
        "frequency": "",
        "comparableScope": ""
      }
    ],
    "directions": [
      "benefit",
      "cost"
    ],
    "weightMethod": "manual",
    "weights": [
      0.4,
      0.6
    ],
    "cellEvidence": [
      {
        "sourceRef": "交接包固定工程样本F01；不是业务事实",
        "period": "2025",
        "nature": "demo",
        "reviewStatus": "verified",
        "quote": "",
        "page": "",
        "reviewedBy": "工程验收",
        "reviewedAt": "2026-10-17T16:16:03.706Z",
        "objectId": "3eefae70-49d9-43e1-8d1c-3c397f9fab4d",
        "indicatorId": "5fd4c190-2370-4e23-a64e-cfd713887c2d",
        "value": 1
      },
      {
        "sourceRef": "交接包固定工程样本F01；不是业务事实",
        "period": "2025",
        "nature": "demo",
        "reviewStatus": "verified",
        "quote": "",
        "page": "",
        "reviewedBy": "工程验收",
        "reviewedAt": "2026-10-17T16:16:03.706Z",
        "objectId": "3eefae70-49d9-43e1-8d1c-3c397f9fab4d",
        "indicatorId": "b1facbcc-26e2-4d88-a6b9-dee7c06a2d03",
        "value": 9
      },
      {
        "sourceRef": "交接包固定工程样本F01；不是业务事实",
        "period": "2025",
        "nature": "demo",
        "reviewStatus": "verified",
        "quote": "",
        "page": "",
        "reviewedBy": "工程验收",
        "reviewedAt": "2026-10-17T16:16:03.706Z",
        "objectId": "2192fe3d-5c04-4581-b445-7358f6367d9e",
        "indicatorId": "5fd4c190-2370-4e23-a64e-cfd713887c2d",
        "value": 5
      },
      {
        "sourceRef": "交接包固定工程样本F01；不是业务事实",
        "period": "2025",
        "nature": "demo",
        "reviewStatus": "verified",
        "quote": "",
        "page": "",
        "reviewedBy": "工程验收",
        "reviewedAt": "2026-10-17T16:16:03.706Z",
        "objectId": "2192fe3d-5c04-4581-b445-7358f6367d9e",
        "indicatorId": "b1facbcc-26e2-4d88-a6b9-dee7c06a2d03",
        "value": 5
      },
      {
        "sourceRef": "交接包固定工程样本F01；不是业务事实",
        "period": "2025",
        "nature": "demo",
        "reviewStatus": "verified",
        "quote": "",
        "page": "",
        "reviewedBy": "工程验收",
        "reviewedAt": "2026-10-17T16:16:03.706Z",
        "objectId": "ad67fdfc-6e91-42fe-8b63-f96599fdab95",
        "indicatorId": "5fd4c190-2370-4e23-a64e-cfd713887c2d",
        "value": 9
      },
      {
        "sourceRef": "交接包固定工程样本F01；不是业务事实",
        "period": "2025",
        "nature": "demo",
        "reviewStatus": "verified",
        "quote": "",
        "page": "",
        "reviewedBy": "工程验收",
        "reviewedAt": "2026-10-17T16:16:03.706Z",
        "objectId": "ad67fdfc-6e91-42fe-8b63-f96599fdab95",
        "indicatorId": "b1facbcc-26e2-4d88-a6b9-dee7c06a2d03",
        "value": 1
      }
    ],
    "scan": {
      "type": "nine-point",
      "indicatorIndex": 0
    }
  },
  "provenance": {
    "kind": "researcher-confirmed",
    "description": "交接包固定工程样本F01；不是业务事实",
    "unit": "各指标单位见表头",
    "period": "2025",
    "urls": [],
    "author": "工程验收",
    "reason": "交接包F01的固定工程权重，单一判断样本",
    "verification": "研究人员声明；系统未自动核实输入真实性"
  },
  "sourceRefs": [
    {
      "sourceRef": "交接包固定工程样本F01；不是业务事实",
      "period": "2025",
      "nature": "demo",
      "reviewStatus": "verified",
      "quote": "",
      "page": "",
      "reviewedBy": "工程验收",
      "reviewedAt": "2026-10-17T16:16:03.706Z",
      "objectId": "3eefae70-49d9-43e1-8d1c-3c397f9fab4d",
      "indicatorId": "5fd4c190-2370-4e23-a64e-cfd713887c2d",
      "value": 1
    },
    {
      "sourceRef": "交接包固定工程样本F01；不是业务事实",
      "period": "2025",
      "nature": "demo",
      "reviewStatus": "verified",
      "quote": "",
      "page": "",
      "reviewedBy": "工程验收",
      "reviewedAt": "2026-10-17T16:16:03.706Z",
      "objectId": "3eefae70-49d9-43e1-8d1c-3c397f9fab4d",
      "indicatorId": "b1facbcc-26e2-4d88-a6b9-dee7c06a2d03",
      "value": 9
    },
    {
      "sourceRef": "交接包固定工程样本F01；不是业务事实",
      "period": "2025",
      "nature": "demo",
      "reviewStatus": "verified",
      "quote": "",
      "page": "",
      "reviewedBy": "工程验收",
      "reviewedAt": "2026-10-17T16:16:03.706Z",
      "objectId": "2192fe3d-5c04-4581-b445-7358f6367d9e",
      "indicatorId": "5fd4c190-2370-4e23-a64e-cfd713887c2d",
      "value": 5
    },
    {
      "sourceRef": "交接包固定工程样本F01；不是业务事实",
      "period": "2025",
      "nature": "demo",
      "reviewStatus": "verified",
      "quote": "",
      "page": "",
      "reviewedBy": "工程验收",
      "reviewedAt": "2026-10-17T16:16:03.706Z",
      "objectId": "2192fe3d-5c04-4581-b445-7358f6367d9e",
      "indicatorId": "b1facbcc-26e2-4d88-a6b9-dee7c06a2d03",
      "value": 5
    },
    {
      "sourceRef": "交接包固定工程样本F01；不是业务事实",
      "period": "2025",
      "nature": "demo",
      "reviewStatus": "verified",
      "quote": "",
      "page": "",
      "reviewedBy": "工程验收",
      "reviewedAt": "2026-10-17T16:16:03.706Z",
      "objectId": "ad67fdfc-6e91-42fe-8b63-f96599fdab95",
      "indicatorId": "5fd4c190-2370-4e23-a64e-cfd713887c2d",
      "value": 9
    },
    {
      "sourceRef": "交接包固定工程样本F01；不是业务事实",
      "period": "2025",
      "nature": "demo",
      "reviewStatus": "verified",
      "quote": "",
      "page": "",
      "reviewedBy": "工程验收",
      "reviewedAt": "2026-10-17T16:16:03.706Z",
      "objectId": "ad67fdfc-6e91-42fe-8b63-f96599fdab95",
      "indicatorId": "b1facbcc-26e2-4d88-a6b9-dee7c06a2d03",
      "value": 1
    }
  ],
  "dataset": null,
  "scope": {
    "topic": "",
    "country": "",
    "sourceId": "",
    "from": "",
    "to": ""
  },
  "numericInputHash": "aae52e3ccf84984542957c1932ee6399811312f67cc3772800889fbfc4e82279",
  "evidenceHash": "a055abeb385a145a7bab97103f653f4faff10d8841ae18dade706d0bf9e5aee5",
  "configHash": "ed7ec7149bfe58ce2aa074b6d32eedd5fb7ae9d7cb089fcec36f3e78a0dc276a",
  "dataHash": "ce395430ed5a0f3aafada27c24075d04c66e88258217276881f9e8bacb148652",
  "snapshotAt": "2026-10-17T08:00:00Z",
  "insightRevision": null,
  "calculation": {
    "engineVersion": "1.1.0",
    "method": "topsis",
    "result": {
      "weights": [
        0.4,
        0.6
      ],
      "weightMethod": "manual",
      "normalization": "按列min–max；逆向指标反转；恒定列归零；TOPSIS对标准化矩阵加权后计算欧氏距离",
      "ranking": [
        {
          "label": "C",
          "score": 1,
          "rank": 1,
          "tied": false
        },
        {
          "label": "B",
          "score": 0.5,
          "rank": 2,
          "tied": false
        },
        {
          "label": "A",
          "score": 0,
          "rank": 3,
          "tied": false
        }
      ],
      "normalized": [
        [
          0,
          0
        ],
        [
          0.5,
          0.5
        ],
        [
          1,
          1
        ]
      ],
      "comparison": [
        {
          "method": "weighted",
          "ranking": [
            {
              "label": "C",
              "score": 1,
              "rank": 1,
              "tied": false
            },
            {
              "label": "B",
              "score": 0.5,
              "rank": 2,
              "tied": false
            },
            {
              "label": "A",
              "score": 0,
              "rank": 3,
              "tied": false
            }
          ]
        },
        {
          "method": "topsis",
          "ranking": [
            {
              "label": "C",
              "score": 1,
              "rank": 1,
              "tied": false
            },
            {
              "label": "B",
              "score": 0.5,
              "rank": 2,
              "tied": false
            },
            {
              "label": "A",
              "score": 0,
              "rank": 3,
              "tied": false
            }
          ]
        }
      ],
      "perturbations": [
        {
          "indicator": "演示收益",
          "multiplier": 0.8,
          "weights": [
            0.3478260869565218,
            0.6521739130434782
          ],
          "scores": [
            0,
            0.5,
            1
          ],
          "leaders": [
            "C"
          ],
          "ranking": [
            {
              "label": "C",
              "score": 1
            },
            {
              "label": "B",
              "score": 0.5
            },
            {
              "label": "A",
              "score": 0
            }
          ]
        },
        {
          "indicator": "演示收益",
          "multiplier": 1.2,
          "weights": [
            0.4444444444444444,
            0.5555555555555555
          ],
          "scores": [
            0,
            0.5,
            1
          ],
          "leaders": [
            "C"
          ],
          "ranking": [
            {
              "label": "C",
              "score": 1
            },
            {
              "label": "B",
              "score": 0.5
            },
            {
              "label": "A",
              "score": 0
            }
          ]
        },
        {
          "indicator": "演示成本",
          "multiplier": 0.8,
          "weights": [
            0.4545454545454546,
            0.5454545454545454
          ],
          "scores": [
            0,
            0.5,
            1
          ],
          "leaders": [
            "C"
          ],
          "ranking": [
            {
              "label": "C",
              "score": 1
            },
            {
              "label": "B",
              "score": 0.5
            },
            {
              "label": "A",
              "score": 0
            }
          ]
        },
        {
          "indicator": "演示成本",
          "multiplier": 1.2,
          "weights": [
            0.35714285714285715,
            0.6428571428571428
          ],
          "scores": [
            0,
            0.5,
            1
          ],
          "leaders": [
            "C"
          ],
          "ranking": [
            {
              "label": "C",
              "score": 1
            },
            {
              "label": "B",
              "score": 0.5
            },
            {
              "label": "A",
              "score": 0
            }
          ]
        }
      ],
      "scan": {
        "type": "nine-point",
        "indicatorIndex": 0,
        "range": [
          0.1,
          0.9
        ],
        "step": 0.1,
        "seed": null,
        "remainingWeightRule": "其余指标保持原相对比例",
        "scoring": "topsis",
        "points": [
          {
            "value": 0.1,
            "weights": [
              0.1,
              0.9
            ],
            "ranking": [
              {
                "label": "C",
                "score": 1
              },
              {
                "label": "B",
                "score": 0.5
              },
              {
                "label": "A",
                "score": 0
              }
            ]
          },
          {
            "value": 0.2,
            "weights": [
              0.2,
              0.8
            ],
            "ranking": [
              {
                "label": "C",
                "score": 1
              },
              {
                "label": "B",
                "score": 0.5
              },
              {
                "label": "A",
                "score": 0
              }
            ]
          },
          {
            "value": 0.3,
            "weights": [
              0.3,
              0.7
            ],
            "ranking": [
              {
                "label": "C",
                "score": 1
              },
              {
                "label": "B",
                "score": 0.5
              },
              {
                "label": "A",
                "score": 0
              }
            ]
          },
          {
            "value": 0.4,
            "weights": [
              0.4,
              0.6
            ],
            "ranking": [
              {
                "label": "C",
                "score": 1
              },
              {
                "label": "B",
                "score": 0.5
              },
              {
                "label": "A",
                "score": 0
              }
            ]
          },
          {
            "value": 0.5,
            "weights": [
              0.5,
              0.5
            ],
            "ranking": [
              {
                "label": "C",
                "score": 1
              },
              {
                "label": "B",
                "score": 0.5
              },
              {
                "label": "A",
                "score": 0
              }
            ]
          },
          {
            "value": 0.6,
            "weights": [
              0.6,
              0.4
            ],
            "ranking": [
              {
                "label": "C",
                "score": 1
              },
              {
                "label": "B",
                "score": 0.5
              },
              {
                "label": "A",
                "score": 0
              }
            ]
          },
          {
            "value": 0.7,
            "weights": [
              0.7,
              0.30000000000000004
            ],
            "ranking": [
              {
                "label": "C",
                "score": 1
              },
              {
                "label": "B",
                "score": 0.5
              },
              {
                "label": "A",
                "score": 0
              }
            ]
          },
          {
            "value": 0.8,
            "weights": [
              0.8,
              0.19999999999999996
            ],
            "ranking": [
              {
                "label": "C",
                "score": 1
              },
              {
                "label": "B",
                "score": 0.5
              },
              {
                "label": "A",
                "score": 0
              }
            ]
          },
          {
            "value": 0.9,
            "weights": [
              0.9,
              0.09999999999999998
            ],
            "ranking": [
              {
                "label": "C",
                "score": 1
              },
              {
                "label": "B",
                "score": 0.5
              },
              {
                "label": "A",
                "score": 0
              }
            ]
          }
        ]
      }
    },
    "notes": [
      "得分仅用于本次给定对象的相对比较；不代表绝对水平。赋权方法页的排序为TOPSIS辅助预览。",
      "逐项权重±20%后重新归一化；这是局部权重稳健性，不是统计显著性。",
      "九点扫描为偏好区间检验，与逐项±20%局部敏感性分别保存；不代表输入误差、模型不确定性或统计显著性。"
    ]
  },
  "diagnostics": {
    "readiness": {
      "engineStatus": "accepted",
      "dataStatus": "ready",
      "status": "ready",
      "canExecute": true,
      "missingFields": [],
      "fieldErrors": []
    },
    "notes": [
      "得分仅用于本次给定对象的相对比较；不代表绝对水平。赋权方法页的排序为TOPSIS辅助预览。",
      "逐项权重±20%后重新归一化；这是局部权重稳健性，不是统计显著性。",
      "九点扫描为偏好区间检验，与逐项±20%局部敏感性分别保存；不代表输入误差、模型不确定性或统计显著性。"
    ],
    "uncertainty": {
      "weightSensitivity": true,
      "ninePointScan": true,
      "scenario": false,
      "inputError": "未建模",
      "modelUncertainty": "未建模"
    }
  },
  "runMode": "current",
  "revisionReason": null,
  "parameterAudit": null,
  "requestId": "ba1ac885-da0b-4a62-bfab-c0c5497d3abb",
  "requestHash": "f88316d3887aed574de276370368120a5062f04a463563fe5bce33111ca5b733"
}
```
