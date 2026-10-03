"""
Function to initialize streamlit session states and environment variables
"""

from typing import Any, Dict

import streamlit as st
from dotenv import load_dotenv

# load .env file to environment
load_dotenv()


def ensure_states(state_dict: Dict[str, Any]) -> None:
    """
    Define key values in session state
    if key not already defined
    """
    for key, default_value in state_dict.items():
        if key not in st.session_state:
            st.session_state[key] = default_value
