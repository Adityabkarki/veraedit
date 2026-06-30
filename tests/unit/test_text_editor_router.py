"""
Unit tests for text_editor router (Module 04).
"""
import os
import sys
import uuid

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "apps", "api"))


def test_job_type_includes_apply_cuts():
    from models.job import JobType

    assert JobType.APPLY_CUTS.value == "APPLY_CUTS"


def test_apply_cuts_request_schema():
    from routers.text_editor import ApplyCutsRequest

    req = ApplyCutsRequest(
        video_key="projects/p1/raw/x.mp4",
        project_id=str(uuid.uuid4()),
        cuts=[{"start": 1.0, "end": 2.0, "reason": "filler"}],
    )
    assert len(req.cuts) == 1


def test_detect_fillers_endpoint():
    from routers.text_editor import fillers_endpoint, DetectFillersRequest

    res = fillers_endpoint(
        DetectFillersRequest(
            words=[{"word": "um", "start": 0, "end": 0.3}],
            language="en",
        )
    )
    assert res["count"] == 1
