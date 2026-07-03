from vocalmind.audio.emotion2vec_adapter import parse_funasr_result


def test_parse_funasr_result_extracts_best_label_and_scores():
    prediction = parse_funasr_result(
        [
            {
                "labels": ["angry", "neutral", "sad"],
                "scores": [0.1, 0.2, 0.7],
            }
        ]
    )

    assert prediction.source == "audio"
    assert prediction.label == "sad"
    assert prediction.confidence == 0.7
    assert prediction.scores == {"angry": 0.1, "neutral": 0.2, "sad": 0.7}
